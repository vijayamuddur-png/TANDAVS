/* LifeManager v2 — personal finance, family expenses, friends settlements, reminders & projects.
   Data lives in ONE built-in table on the phone (IndexedDB store "records") and is synced to ONE file
   (data/records.json) in your PRIVATE GitHub repository, so every family phone shares the same data.
   A GitHub Actions robot in that repository sends reminder emails, the morning summary and backups. */
'use strict';

const APP_VERSION = '3.0.0';
const ME = 'Me';
let R = [];          // in-memory copy of all records
let S = null;        // settings record
let deferredInstall = null;

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = p => { const a = Math.abs(p || 0); return (p < 0 ? '−' : '') + (S?.details.currency || '₹') + (a % 100 ? nf2 : nf).format(a / 100); };
const toPaise = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return v !== '' && isFinite(n) ? Math.round(n * 100) : NaN; };
const fromPaise = p => (p == null ? '' : (p / 100).toString());
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const curMonth = () => today().slice(0, 7);
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
const uid = t => t.slice(0, 3).toUpperCase() + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const byId = id => R.find(r => r.id === id);
const ofType = t => R.filter(r => r.type === t);
const initials = s => String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = s => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
};
const fmtMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const fmtTime = t => { if (!t) return ''; const [h, mi] = t.split(':').map(Number); return new Date(2000, 0, 1, h, mi).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label ?? v)}</option>`;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- GitHub sync ---------- */
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
};
const GH_API = 'https:' + '//api.github.com';
const DATA_PATH = 'data/records.json';
const ROBOT_WORKFLOW = 'lifemanager-bot.yml';
let CONN = ls.get('lm_gh', null);           /* { repo: 'owner/name', token, branch, sha, prevSha, lastSync } */
let syncTimer = null, syncing = false, syncState = CONN ? 'Not synced yet' : 'Not connected';
function outboxAdd(ids) { if (!CONN) return; const o = ls.get('lm_outbox', {}); ids.forEach(id => o[id] = Date.now() + Math.random()); ls.set('lm_outbox', o); scheduleSync(); }
function deletedAdd(ids) {
  if (!CONN) return;
  const d = ls.get('lm_deleted', []); ls.set('lm_deleted', [...new Set(d.concat(ids))]);
  const o = ls.get('lm_outbox', {}); ids.forEach(id => delete o[id]); ls.set('lm_outbox', o);
  scheduleSync();
}
function scheduleSync(ms = 1500) { if (!CONN) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(true), ms); }
function ghMessage(status, j) {
  if (status === 401) return 'GitHub token is wrong or has expired. Create a new token and reconnect.';
  if (status === 403) return 'The GitHub token does not have permission for this (check Contents / Actions / Workflows are "Read and write"), or GitHub is limiting requests - try again in a minute.';
  if (status === 404) return 'Not found on GitHub. Check the repository name (owner/name) and that the token was given access to that repository.';
  return (j && j.message) || ('GitHub error ' + status);
}
async function gh(path, opts = {}, conn = CONN) {
  if (!conn) throw new Error('Not connected to GitHub');
  let res;
  try {
    res = await fetch(GH_API + path, { method: opts.method || 'GET', cache: 'no-store', body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + conn.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch (e) { throw new Error('No internet connection.'); }
  if (res.status === 204) return null;
  let j = null; try { j = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) { const err = new Error(ghMessage(res.status, j)); err.status = res.status; throw err; }
  return j;
}
const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = b64 => { const bin = atob(String(b64 || '').replace(/\s/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); };
async function getFile(path, conn = CONN) {
  try {
    const j = await gh(`/repos/${conn.repo}/contents/${path}?ref=${encodeURIComponent(conn.branch)}`, {}, conn);
    let content = j.content;
    if (!content && j.size > 0) content = (await gh(`/repos/${conn.repo}/git/blobs/${j.sha}`, {}, conn)).content; /* files over 1 MB */
    return { text: b64dec(content), sha: j.sha };
  } catch (e) { if (e.status === 404) return { text: null, sha: null }; throw e; }
}
async function putFile(path, text, sha, message, conn = CONN) {
  const body = { message, content: b64enc(text), branch: conn.branch };
  if (sha) body.sha = sha;
  const j = await gh(`/repos/${conn.repo}/contents/${path}`, { method: 'PUT', body }, conn);
  return j.content.sha;
}
async function readRemote(conn = CONN) {
  const f = await getFile(DATA_PATH, conn);
  if (!f.text) return { records: [], sha: f.sha };
  const data = JSON.parse(f.text);
  return { records: Array.isArray(data) ? data : (data.records || []), sha: f.sha };
}
const dataFileText = list => JSON.stringify({ app: 'lifemanager', version: APP_VERSION, savedAt: new Date().toISOString(), records: list }, null, 1);
async function writeRemote(list, sha, message = 'LifeManager: update data') { return putFile(DATA_PATH, dataFileText(list), sha, message); }

async function syncNow(silent = true) {
  if (!CONN) return;
  if (syncing) { scheduleSync(2500); return; }
  if (!navigator.onLine) { syncState = 'Offline - changes will sync later'; return; }
  syncing = true; syncState = 'Syncing...';
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ob = ls.get('lm_outbox', {}), dels = ls.get('lm_deleted', []);
      const remote = await readRemote();
      /* GitHub can briefly return the version from before our own last save - ignore that stale copy */
      if (remote.sha && remote.sha === CONN.prevSha && CONN.sha && !Object.keys(ob).length && !dels.length) break;
      const map = new Map(remote.records.map(x => [x.id, x]));
      let push = false;
      dels.forEach(id => { if (map.delete(id)) push = true; });
      Object.keys(ob).forEach(id => {
        const loc = byId(id); if (!loc) return;
        const ex = map.get(id);
        if (!ex || !ex.updatedAt || !loc.updatedAt || ex.updatedAt <= loc.updatedAt) {
          if (!ex || JSON.stringify(ex) !== JSON.stringify(loc)) push = true;
          map.set(id, loc);
        }
      });
      if (!map.has('SETTINGS') && S) { map.set('SETTINGS', S); push = true; }
      let list = [...map.values()];
      let sha = remote.sha;
      if (push) {
        try { sha = await writeRemote(list, remote.sha); }
        catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 3) continue; throw e; } /* someone else saved first: re-read and merge */
      }
      const ob2 = ls.get('lm_outbox', {});
      Object.keys(ob).forEach(id => { if (ob2[id] === ob[id]) delete ob2[id]; });
      ls.set('lm_outbox', ob2);
      ls.set('lm_deleted', ls.get('lm_deleted', []).filter(x => !dels.includes(x)));
      const changed = push || remote.sha !== CONN.sha;
      if (changed) {
        const lm = new Map(list.map(x => [x.id, x]));
        Object.keys(ob2).forEach(id => { const loc = byId(id); if (loc) lm.set(id, loc); }); /* edits made while syncing */
        list = [...lm.values()];
        await DB.replaceAll(list);
        R = list;
        S = R.find(x => x.id === 'SETTINGS') || S;
        ensureSettings();
      }
      CONN.prevSha = push ? remote.sha : CONN.prevSha;
      CONN.sha = sha; CONN.lastSync = new Date().toISOString(); ls.set('lm_gh', CONN);
      syncState = 'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      if (changed && !$('#sheet').innerHTML && route().view !== 'settings') render();
      break;
    }
    if (route().view === 'settings') { const el = $('#sync-state'); if (el) el.textContent = syncState; }
  } catch (e) {
    syncState = 'Sync problem: ' + e.message;
    if (!silent) alert(syncState);
  } finally { syncing = false; }
}
async function installRobot(conn = CONN, quiet = false) {
  try {
    for (const [path, text] of Object.entries(ROBOT_FILES)) {
      const cur = await getFile(path, conn);
      if (cur.text === text) continue;
      await putFile(path, text, cur.sha, 'LifeManager: install email robot', conn);
    }
    return true;
  } catch (e) {
    if (!quiet) alert('Could not install the email robot: ' + e.message + (e.status === 403 || e.status === 404 ? '\n\nThe token needs "Workflows: Read and write" permission.' : ''));
    return false;
  }
}
async function runRobot(mode) {
  await gh(`/repos/${CONN.repo}/actions/workflows/${ROBOT_WORKFLOW}/dispatches`, { method: 'POST', body: { ref: CONN.branch, inputs: { mode } } });
}
async function connectGitHub(repo, token) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository must look like  your-username/lifemanager-data');
  const conn = { repo, token: token.trim(), branch: 'main', sha: null, prevSha: null, lastSync: null };
  const info = await gh(`/repos/${repo}`, {}, conn);
  conn.branch = info.default_branch || 'main';
  if (!info.private && !confirm('WARNING: this repository is PUBLIC, so anyone could read your family data.\n\nMake it private on GitHub (Settings > General > Danger Zone > Change visibility).\n\nContinue anyway?')) throw new Error('Make the data repository private, then connect again.');
  const remote = await readRemote(conn);
  const server = new Map(remote.records.map(x => [x.id, x]));
  CONN = conn; ls.set('lm_gh', CONN); ls.set('lm_deleted', []);
  /* send this phone's records that GitHub doesn't have yet (keep GitHub's settings if it already has them) */
  const push = R.filter(x => !server.has(x.id) && !(x.id === 'SETTINGS' && server.has('SETTINGS'))).map(x => x.id);
  ls.set('lm_outbox', {}); outboxAdd(push);
  clearTimeout(syncTimer);
  await syncNow(false);
  const robotOk = await installRobot(CONN, true);
  return robotOk;
}
function disconnectGitHub() { CONN = null; ls.set('lm_gh', null); ls.set('lm_outbox', {}); ls.set('lm_deleted', []); syncState = 'Not connected'; }
function connectForm(firstRun) {
  openSheet('Connect to GitHub', `
    <p class="muted small" style="margin:0 0 12px">Enter your <b>private data repository</b> and your <b>GitHub token</b>. Use the same two values on your wife's phone so you both share the same data.</p>
    <label class="field"><span>Data repository (username/repository)</span><input name="repo" value="${esc(CONN?.repo || '')}" placeholder="your-username/lifemanager-data" autocomplete="off" autocapitalize="none"></label>
    <label class="field"><span>GitHub token (starts with github_pat_)</span><input name="token" type="password" value="${esc(CONN?.token || '')}" autocomplete="off"></label>
    ${firstRun ? '<p class="hint muted">You can skip this and use the app on this phone only; connect later from Settings.</p>' : ''}`,
    async (fd, f) => {
      const btn = $('button.btn:not(.ghost):not(.danger)', f); btn.disabled = true; btn.textContent = 'Connecting...';
      try {
        const robot = await connectGitHub(fd.get('repo'), fd.get('token'));
        ls.set('lm_skip_connect', true);
        toast(robot ? 'Connected - data synced, email robot installed' : 'Connected - data synced');
        if (!robot) setTimeout(() => alert('Data sync works, but the email robot could not be installed.\nGive the token "Workflows: Read and write" permission, then tap Settings > Install email robot.'), 300);
      } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Connect'; return false; }
    },
    { submit: 'Connect', extra: firstRun ? '<button type="button" class="btn ghost" id="skip-connect">Skip for now</button>' : '',
      onOpen: f => { const b = $('#skip-connect', f); if (b) b.addEventListener('click', () => { ls.set('lm_skip_connect', true); closeSheet(); }); } });
}

/* ---------- icons ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2A5 5 0 0 1 21.5 19"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9 13 2 2 4-4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12M6 9h12M14 4c3 0 3 10-6 10l8 7"/></svg>',
  task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'
};

/* ---------- data ---------- */
const DEFAULT_SETTINGS = () => ({
  id: 'SETTINGS', type: 'settings', title: 'Settings', status: 'active',
  details: {
    name: '', currency: '₹', members: ['Me', 'Wife'], budget: 4000000,
    expenseCategories: ['Groceries', 'Rent', 'Bills & Utilities', 'Food & Dining', 'Travel', 'Fuel', 'Shopping', 'Health', 'Education', 'Entertainment', 'Gifts', 'Other'],
    incomeCategories: ['Salary', 'Business', 'Interest', 'Refund', 'Gift', 'Other'],
    paymentModes: ['UPI', 'Cash', 'Card', 'Bank transfer'],
    lastBackup: null
  }
});

async function save(rec) {
  const now = new Date().toISOString();
  rec.createdAt = rec.createdAt || now;
  rec.updatedAt = now;
  for (const k of ['title', 'amount', 'date', 'status', 'category', 'person', 'groupId', 'parentId']) if (!(k in rec)) rec[k] = null;
  rec.details = rec.details || {};
  await DB.put(rec);
  const i = R.findIndex(r => r.id === rec.id);
  if (i >= 0) R[i] = rec; else R.push(rec);
  if (rec.type === 'settings') S = rec;
  outboxAdd([rec.id]);
  return rec;
}
async function removeIds(ids) { await DB.delMany(ids); R = R.filter(r => !ids.includes(r.id)); deletedAdd(ids); }
function ensureSettings() { S.details.emails = S.details.emails || {}; }

/* ---------- finance calculations ---------- */
const isTxn = r => r.type === 'expense' || r.type === 'income';
const personalFamily = () => R.filter(r => isTxn(r) && !r.groupId);
function monthTotals(m) {
  const t = { income: 0, personal: 0, family: 0, groupShare: 0 };
  for (const r of personalFamily()) {
    if (!r.date?.startsWith(m)) continue;
    if (r.type === 'income') t.income += r.amount;
    else if (r.details.book === 'family') t.family += r.amount; else t.personal += r.amount;
  }
  for (const e of R) if (e.type === 'expense' && e.groupId && e.date?.startsWith(m)) {
    const s = (e.details.splits || []).find(x => x.person === ME); if (s) t.groupShare += s.share;
  }
  t.spend = t.personal + t.family + t.groupShare;
  return t;
}
function groupBalances(gid) {
  const g = byId(gid); const bal = {};
  (g?.details.members || []).forEach(m => bal[m] = 0);
  for (const r of R) {
    if (r.groupId !== gid) continue;
    if (r.type === 'expense') {
      bal[r.details.paidBy] = (bal[r.details.paidBy] || 0) + r.amount;
      for (const s of r.details.splits || []) bal[s.person] = (bal[s.person] || 0) - s.share;
    } else if (r.type === 'settlement') {
      bal[r.details.from] = (bal[r.details.from] || 0) + r.amount;
      bal[r.details.to] = (bal[r.details.to] || 0) - r.amount;
    }
  }
  return bal;
}
function simplify(bal) {
  const cr = [], dr = [];
  for (const [p, v] of Object.entries(bal)) { if (v > 0) cr.push([p, v]); else if (v < 0) dr.push([p, -v]); }
  cr.sort((a, b) => b[1] - a[1]); dr.sort((a, b) => b[1] - a[1]);
  const out = []; let i = 0, j = 0;
  while (i < dr.length && j < cr.length) {
    const amt = Math.min(dr[i][1], cr[j][1]);
    if (amt > 0) out.push({ from: dr[i][0], to: cr[j][0], amount: amt });
    dr[i][1] -= amt; cr[j][1] -= amt;
    if (!dr[i][1]) i++; if (!cr[j][1]) j++;
  }
  return out;
}
function myDues() {
  let recv = 0, pay = 0; const people = [];
  for (const g of ofType('group')) {
    for (const d of simplify(groupBalances(g.id))) {
      if (d.to === ME) { recv += d.amount; people.push({ ...d, group: g }); }
      if (d.from === ME) { pay += d.amount; people.push({ ...d, group: g }); }
    }
  }
  return { recv, pay, people };
}

/* ---------- reminders ---------- */
const remAt = r => new Date(`${r.date}T${r.details.time || '09:00'}`);
const isOverdue = r => r.status === 'pending' && remAt(r) < new Date();
function nextDate(s, rep, anchor) {
  const [y, m, d] = s.split('-').map(Number);
  const day = anchor || d;
  if (rep === 'daily') return ymd(new Date(y, m - 1, d + 1));
  if (rep === 'weekly') return ymd(new Date(y, m - 1, d + 7));
  if (rep === 'monthly') { const last = new Date(y, m + 1, 0).getDate(); return ymd(new Date(y, m, Math.min(day, last))); }
  if (rep === 'yearly') { const last = new Date(y + 1, m, 0).getDate(); return ymd(new Date(y + 1, m - 1, Math.min(day, last))); }
  return s;
}
const REPEAT = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const BEFORE = { 0: 'At the time', 15: '15 minutes before', 60: '1 hour before', 1440: '1 day before', 4320: '3 days before' };

async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    new Notification(title, { body, tag });
  } catch (e) { /* ignore */ }
}
async function checkReminders() {
  const now = Date.now();
  for (const r of ofType('reminder')) {
    if (r.status !== 'pending') continue;
    const key = `${r.date}T${r.details.time || '09:00'}`;
    const fireAt = new Date(key).getTime() - (Number(r.details.before) || 0) * 60000;
    const seen = ls.get('lm_notified', {});
    if (now >= fireAt && !seen[r.id + key] && now - fireAt < 864e5) {
      seen[r.id + key] = 1; ls.set('lm_notified', seen);
      notify(r.title, `${fmtDate(r.date)} · ${fmtTime(r.details.time)}${r.amount ? ' · ' + money(r.amount) : ''}`, r.id);
    }
  }
  const t = today();
  for (const k of ofType('task')) {
    const seen = ls.get('lm_notified', {});
    if (k.status === 'done' || !k.date || seen[k.id + k.date] || k.date !== t) continue;
    seen[k.id + k.date] = 1; ls.set('lm_notified', seen);
    const p = byId(k.parentId);
    notify(`Task due: ${k.title}`, `${p ? p.title + ' · ' : ''}${fmtDate(k.date)}`, k.id);
  }
}
function icsFor(r) {
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const dt = `${r.date.replace(/-/g, '')}T${(r.details.time || '09:00').replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.details.repeat];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LifeManager//EN', 'BEGIN:VEVENT', `UID:${r.id}@lifemanager`, `DTSTAMP:${stamp}`,
    `DTSTART:${dt}`, 'DURATION:PT15M', `SUMMARY:${e(r.title)}`, `DESCRIPTION:${e((r.amount ? money(r.amount) + ' ' : '') + (r.details.notes || ''))}`,
    freq ? `RRULE:FREQ=${freq}` : null, 'BEGIN:VALARM', `TRIGGER:-PT${Number(r.details.before) || 0}M`, 'ACTION:DISPLAY', `DESCRIPTION:${e(r.title)}`,
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

/* ---------- projects ---------- */
const TASK_STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const TASK_CHIP = { todo: 'grey', doing: 'blue', blocked: 'red', done: '' };
const PROJ_STATUS = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' };
const PROJ_CHIP = { not_started: 'grey', in_progress: 'blue', blocked: 'red', completed: '' };
const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High' };
function projStats(pid) {
  const tasks = R.filter(r => r.type === 'task' && r.parentId === pid);
  const done = tasks.filter(t => t.status === 'done').length;
  const t = today();
  return {
    tasks, total: tasks.length, done,
    doing: tasks.filter(x => x.status === 'doing').length,
    blocked: tasks.filter(x => x.status === 'blocked').length,
    overdue: tasks.filter(x => x.status !== 'done' && x.date && x.date < t).length,
    pct: tasks.length ? Math.round(done / tasks.length * 100) : 0
  };
}

/* ---------- state & routing ---------- */
const ui = { money: { book: 'all', month: curMonth() }, report: { month: curMonth() }, rem: 'upcoming' };
function route() { const [view = 'home', id] = (location.hash.slice(1) || 'home').split('/'); return { view, id }; }
const go = h => { location.hash = h; };

function header(title, sub, back) {
  $('#top').innerHTML = `
    ${back ? `<button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>` : ''}
    <div class="t">${sub ? `<div class="muted">${esc(sub)}</div>` : ''}<h1>${esc(title)}</h1></div>
    <button class="icon-btn" data-act="nav" data-to="reports" aria-label="Reports">${I.chart}</button>
    <button class="icon-btn" data-act="nav" data-to="settings" aria-label="Settings">${I.gear}</button>`;
}
function nav(active) {
  const tabs = [['home', 'Home', I.home], ['money', 'Money', I.wallet], ['groups', 'Groups', I.users], ['reminders', 'Reminders', I.bell], ['projects', 'Projects', I.folder]];
  $('#nav').innerHTML = `<div class="in">${tabs.map(([k, l, ic]) => `<a href="#${k}" class="${active === k ? 'on' : ''}">${ic}<span>${l}</span></a>`).join('')}</div>`;
}
const fab = (act, label) => `<button class="fab" data-act="${act}" aria-label="${esc(label)}">${I.plus}</button>`;

function render() {
  const { view, id } = route();
  const v = $('#view');
  const views = { home: homeView, money: moneyView, groups: groupsView, group: groupView, reminders: remindersView, projects: projectsView, project: projectView, reports: reportsView, settings: settingsView };
  const navKey = { group: 'groups', project: 'projects' }[view] || view;
  nav(navKey);
  v.innerHTML = (views[view] || homeView)(id);
  window.scrollTo(0, 0);
}

/* ---------- views ---------- */
function homeView() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  header(`${greet}${S.details.name ? ', ' + S.details.name : ''}!`, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }));
  const t = monthTotals(curMonth());
  const b = S.details.budget || 0;
  const pct = b ? Math.round(t.spend / b * 100) : 0;
  const { recv, pay } = myDues();
  const td = today();
  const rems = ofType('reminder').filter(r => r.status === 'pending' && r.date <= addDays(td, 2)).sort((a, b) => remAt(a) - remAt(b)).slice(0, 5);
  const tasks = ofType('task').filter(k => k.status !== 'done' && k.date && k.date <= addDays(td, 3)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const recent = personalFamily().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 4);
  const lb = S.details.lastBackup;
  const needBackup = !CONN && R.length > 5 && (!lb || (Date.now() - new Date(lb)) > 7 * 864e5);
  return `
  <div class="card hero">
    <div class="muted small">This month's spending</div>
    <div class="big num">${money(t.spend)}</div>
    <div class="muted small" style="margin-bottom:10px">${b ? `Budget ${money(b)} · ${pct}% used · ${money(Math.max(0, b - t.spend))} left` : 'No budget set'}</div>
    <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
  </div>
  ${!CONN ? `<div class="banner">Connect to GitHub to share data with your family and get reminder emails.<button class="btn ghost" data-act="connect" style="padding:6px 12px">Connect</button></div>` : syncState.startsWith('Sync problem') ? `<div class="banner">${esc(syncState)}<button class="btn ghost" data-act="sync" style="padding:6px 12px">Retry</button></div>` : ''}
  ${needBackup ? `<div class="banner">Your data lives only on this device. Back it up regularly.<button class="btn ghost" data-act="backup" style="padding:6px 12px">Back up</button></div>` : ''}
  <div class="grid2 section">
    <button class="card stat item" style="display:block" data-act="nav" data-to="groups"><div class="label">To receive</div><div class="val pos num">${money(recv)}</div></button>
    <button class="card stat item" style="display:block" data-act="nav" data-to="groups"><div class="label">To pay</div><div class="val neg num">${money(pay)}</div></button>
  </div>
  <div class="section quick">
    <button data-act="add-txn"><span class="qi">${I.rupee}</span>Expense</button>
    <button data-act="add-income"><span class="qi">${I.wallet}</span>Income</button>
    <button data-act="add-rem"><span class="qi">${I.bell}</span>Reminder</button>
    <button data-act="quick-task"><span class="qi">${I.task}</span>Task</button>
  </div>
  <div class="section">
    <div class="section-h"><h2>Reminders</h2><a href="#reminders">View all</a></div>
    ${rems.length ? `<div class="list">${rems.map(remItem).join('')}</div>` : `<div class="card empty">Nothing due in the next 2 days.</div>`}
  </div>
  <div class="section">
    <div class="section-h"><h2>Pending tasks</h2><a href="#projects">Projects</a></div>
    ${tasks.length ? `<div class="list">${tasks.map(k => taskItem(k, true)).join('')}</div>` : `<div class="card empty">No tasks due soon.</div>`}
  </div>
  <div class="section">
    <div class="section-h"><h2>Recent transactions</h2><a href="#money">View all</a></div>
    ${recent.length ? `<div class="list">${recent.map(txnItem).join('')}</div>` : `<div class="card empty">No transactions yet. Tap “Expense” to add one.</div>`}
  </div>`;
}

function txnItem(r) {
  const fam = r.details.book === 'family';
  const sub = [r.category, fam ? `Family · ${r.details.paidBy || ME}` : 'Personal', r.details.mode, fmtDate(r.date)].filter(Boolean).join(' · ');
  return `<button class="item" data-act="edit-txn" data-id="${r.id}">
    <div class="avatar ${r.type === 'income' ? '' : fam ? 'blue' : 'amber'}">${esc(initials(r.category || r.title))}</div>
    <div class="main"><div class="ttl">${esc(r.title || r.category)}</div><div class="sub">${esc(sub)}</div></div>
    <div class="amt num ${r.type === 'income' ? 'pos' : ''}">${r.type === 'income' ? '+' : ''}${money(r.amount)}</div></button>`;
}

function moneyView() {
  header('Money', 'Personal & family');
  const st = ui.money;
  let list = personalFamily().filter(r => r.date?.startsWith(st.month));
  if (st.book === 'personal') list = list.filter(r => r.details.book !== 'family');
  if (st.book === 'family') list = list.filter(r => r.details.book === 'family');
  const inc = list.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const exp = list.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  list.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const days = {};
  list.forEach(r => (days[r.date] = days[r.date] || []).push(r));
  return `
  <div class="seg">${['all', 'personal', 'family'].map(k => `<button class="${st.book === k ? 'on' : ''}" data-act="book" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
  <div class="monthnav"><button class="icon-btn" data-act="month" data-v="-1" aria-label="Previous month">${I.left}</button><b>${fmtMonth(st.month)}</b><button class="icon-btn" data-act="month" data-v="1" aria-label="Next month">${I.right}</button></div>
  <div class="grid3">
    <div class="card stat"><div class="label">Income</div><div class="val pos num" style="font-size:16px">${money(inc)}</div></div>
    <div class="card stat"><div class="label">Expenses</div><div class="val num" style="font-size:16px">${money(exp)}</div></div>
    <div class="card stat"><div class="label">Net</div><div class="val num ${inc - exp < 0 ? 'neg' : ''}" style="font-size:16px">${money(inc - exp)}</div></div>
  </div>
  ${Object.keys(days).length ? Object.entries(days).map(([d, rs]) => `<div class="day-h">${esc(fmtDate(d))}</div><div class="list">${rs.map(txnItem).join('')}</div>`).join('')
    : `<div class="card empty section">No transactions in ${fmtMonth(st.month)}.</div>`}
  ${fab('add-txn', 'Add transaction')}`;
}

function groupsView() {
  header('Groups', 'Friends & shared bills');
  const groups = ofType('group').sort((a, b) => a.title.localeCompare(b.title));
  const { recv, pay } = myDues();
  return `
  <div class="grid2">
    <div class="card stat"><div class="label">You'll receive</div><div class="val pos num">${money(recv)}</div></div>
    <div class="card stat"><div class="label">You owe</div><div class="val neg num">${money(pay)}</div></div>
  </div>
  <div class="section">
    ${groups.length ? `<div class="list">${groups.map(g => {
      const my = groupBalances(g.id)[ME] || 0;
      return `<button class="item" data-act="nav" data-to="group/${g.id}">
        <div class="avatar blue">${esc(initials(g.title))}</div>
        <div class="main"><div class="ttl">${esc(g.title)}</div><div class="sub">${esc(g.details.members.join(', '))}</div></div>
        <div class="amt num ${my > 0 ? 'pos' : my < 0 ? 'neg' : 'muted'}" style="font-size:13px">${my > 0 ? 'Gets ' + money(my) : my < 0 ? 'Owes ' + money(-my) : 'Settled'}</div></button>`;
    }).join('')}</div>` : `<div class="card empty">Create a group for a trip, dinner, flatmates or any shared spending.<br><br><button class="btn" data-act="add-group">Create group</button></div>`}
  </div>
  ${fab('add-group', 'New group')}`;
}

function groupView(id) {
  const g = byId(id);
  if (!g) { go('groups'); return ''; }
  header(g.title, 'Group', true);
  const bal = groupBalances(id);
  const dues = simplify(bal);
  const acts = R.filter(r => r.groupId === id && (r.type === 'expense' || r.type === 'settlement')).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const total = acts.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  return `
  <div class="card">
    <div class="muted small">Total group spending</div>
    <div class="num" style="font-size:26px;font-weight:700">${money(total)}</div>
    <div class="member-chips">${g.details.members.map(m => { const v = bal[m] || 0; return `<span class="chip ${v > 0 ? '' : v < 0 ? 'red' : 'grey'}">${esc(m)} ${v ? (v > 0 ? '+' : '') + money(v) : '✓'}</span>`; }).join('')}</div>
    <div class="btn-row" style="margin-top:14px"><button class="btn" data-act="add-gexp" data-id="${id}">Add expense</button><button class="btn ghost" data-act="add-settle" data-id="${id}">Record payment</button></div>
  </div>
  <div class="section">
    <div class="section-h"><h2>Who owes whom</h2></div>
    ${dues.length ? `<div class="list">${dues.map(d => `<div class="item" style="cursor:default">
      <div class="avatar ${d.from === ME ? 'red' : ''}">${esc(initials(d.from))}</div>
      <div class="main"><div class="ttl">${esc(d.from)} → ${esc(d.to)}</div><div class="sub num">${money(d.amount)}</div></div>
      ${d.to === ME ? `<button class="btn ghost" style="padding:7px 10px;font-size:12.5px" data-act="nudge" data-id="${id}" data-p="${esc(d.from)}" data-a="${d.amount}">Remind</button>` : ''}
      <button class="btn" style="padding:7px 10px;font-size:12.5px" data-act="add-settle" data-id="${id}" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-a="${d.amount}">Settle</button></div>`).join('')}</div>`
      : `<div class="card empty">All settled up.</div>`}
  </div>
  <div class="section">
    <div class="section-h"><h2>Activity</h2><button class="link" data-act="edit-group" data-id="${id}">Edit group</button></div>
    ${acts.length ? `<div class="list">${acts.map(r => r.type === 'expense'
      ? `<button class="item" data-act="edit-gexp" data-id="${r.id}"><div class="avatar amber">${esc(initials(r.title))}</div>
          <div class="main"><div class="ttl">${esc(r.title)}</div><div class="sub">${esc(r.details.paidBy)} paid · ${esc({ equal: 'Equal', exact: 'Exact amounts', percent: 'By %' }[r.details.splitMethod] || '')} · ${esc(fmtDate(r.date))}</div></div>
          <div class="amt num">${money(r.amount)}</div></button>`
      : `<button class="item" data-act="edit-settle" data-id="${r.id}"><div class="avatar">${I.tick.replace('<svg', '<svg width="18" height="18"')}</div>
          <div class="main"><div class="ttl">${esc(r.details.from)} paid ${esc(r.details.to)}</div><div class="sub">Settlement${r.details.mode ? ' · ' + esc(r.details.mode) : ''} · ${esc(fmtDate(r.date))}</div></div>
          <div class="amt num pos">${money(r.amount)}</div></button>`).join('')}</div>` : `<div class="card empty">No expenses yet.</div>`}
  </div>`;
}

function remItem(r) {
  const od = isOverdue(r);
  const done = r.status === 'completed';
  return `<div class="item" data-act="edit-rem" data-id="${r.id}">
    <button class="check ${done ? 'done' : ''}" data-act="done-rem" data-id="${r.id}" aria-label="Mark done">${done ? I.tick : ''}</button>
    <div class="main"><div class="ttl" style="${done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(r.title)}</div>
      <div class="sub">${esc(fmtDate(r.date))} · ${esc(fmtTime(r.details.time))}${r.details.repeat && r.details.repeat !== 'none' ? ' · ' + REPEAT[r.details.repeat] : ''}</div></div>
    <div style="text-align:right">${r.amount ? `<div class="amt num">${money(r.amount)}</div>` : ''}${od ? '<span class="chip red">Overdue</span>' : r.details.priority === 'high' && !done ? '<span class="chip amber">High</span>' : ''}</div></div>`;
}

function remindersView() {
  header('Reminders', 'Bills, follow-ups & routines');
  const all = ofType('reminder');
  const pend = all.filter(r => r.status === 'pending').sort((a, b) => remAt(a) - remAt(b));
  const td = today();
  const od = pend.filter(isOverdue), tday = pend.filter(r => r.date === td && !isOverdue(r)), up = pend.filter(r => r.date > td && !isOverdue(r));
  const done = all.filter(r => r.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  const sec = (t, rs) => rs.length ? `<div class="day-h">${t}</div><div class="list">${rs.map(remItem).join('')}</div>` : '';
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
  <div class="seg"><button class="${ui.rem === 'upcoming' ? 'on' : ''}" data-act="remtab" data-v="upcoming">Pending (${pend.length})</button><button class="${ui.rem === 'done' ? 'on' : ''}" data-act="remtab" data-v="done">Completed</button></div>
  ${perm === 'default' ? `<div class="banner">Turn on notifications to get alerts on this device.<button class="btn ghost" data-act="perm" style="padding:6px 12px">Enable</button></div>` : ''}
  ${ui.rem === 'upcoming'
    ? (pend.length ? sec('Overdue', od) + sec('Today', tday) + sec('Upcoming', up) : `<div class="card empty section">No pending reminders.</div>`)
    : (done.length ? sec('Recently completed', done) : `<div class="card empty section">Nothing completed yet.</div>`)}
  ${fab('add-rem', 'Add reminder')}`;
}

function taskItem(k, showProject) {
  const p = showProject ? byId(k.parentId) : null;
  const od = k.status !== 'done' && k.date && k.date < today();
  return `<div class="item" data-act="edit-task" data-id="${k.id}">
    <button class="check ${k.status === 'done' ? 'done' : ''}" data-act="toggle-task" data-id="${k.id}" aria-label="Toggle done">${k.status === 'done' ? I.tick : ''}</button>
    <div class="main"><div class="ttl" style="${k.status === 'done' ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(k.title)}</div>
      <div class="sub">${esc([p?.title, k.person, k.date ? 'Due ' + fmtDate(k.date) : null, PRIORITY[k.details.priority] ? PRIORITY[k.details.priority] + ' priority' : null].filter(Boolean).join(' · '))}</div></div>
    ${od ? '<span class="chip red">Overdue</span>' : `<span class="chip ${TASK_CHIP[k.status]}">${TASK_STATUS[k.status]}</span>`}</div>`;
}

function projectsView() {
  header('Projects', 'Work, home & goals');
  const ps = ofType('project').sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (a.date || '9').localeCompare(b.date || '9'));
  return `${ps.length ? `<div class="list">${ps.map(p => {
    const s = projStats(p.id);
    return `<button class="item" data-act="nav" data-to="project/${p.id}" style="flex-wrap:wrap">
      <div class="main"><div class="ttl">${esc(p.title)}</div>
      <div class="sub">${s.done}/${s.total} tasks${s.overdue ? ` · <span class="neg">${s.overdue} overdue</span>` : ''}${p.date ? ' · Target ' + esc(fmtDate(p.date)) : ''}</div></div>
      <span class="chip ${PROJ_CHIP[p.status]}">${PROJ_STATUS[p.status]}</span>
      <div style="flex-basis:100%;display:flex;align-items:center;gap:10px;margin-top:8px"><div class="bar" style="flex:1"><i style="width:${s.pct}%"></i></div><b class="small num">${s.pct}%</b></div></button>`;
  }).join('')}</div>` : `<div class="card empty">Track home renovation, work deliverables or personal goals.<br><br><button class="btn" data-act="add-proj">Create project</button></div>`}
  ${fab('add-proj', 'New project')}`;
}

function projectView(id) {
  const p = byId(id);
  if (!p) { go('projects'); return ''; }
  header(p.title, 'Project', true);
  const s = projStats(id);
  const order = ['doing', 'blocked', 'todo', 'done'];
  const groups = order.map(st => [st, s.tasks.filter(t => t.status === st).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))]).filter(([, l]) => l.length);
  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="chip ${PROJ_CHIP[p.status]}">${PROJ_STATUS[p.status]}</span><button class="link" data-act="edit-proj" data-id="${id}">Edit</button></div>
    ${p.details.description ? `<p class="muted" style="margin:10px 0 0">${esc(p.details.description)}</p>` : ''}
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px"><div class="bar" style="flex:1"><i style="width:${s.pct}%"></i></div><b class="num">${s.pct}%</b></div>
    <div class="grid3" style="margin-top:14px;text-align:center">
      <div><div class="val" style="font-weight:700;font-size:18px">${s.total - s.done}</div><div class="small muted">Pending</div></div>
      <div><div class="val" style="font-weight:700;font-size:18px">${s.done}</div><div class="small muted">Completed</div></div>
      <div><div class="val ${s.overdue ? 'neg' : ''}" style="font-weight:700;font-size:18px">${s.overdue}</div><div class="small muted">Overdue</div></div>
    </div>
    <div class="small muted" style="margin-top:12px">${[p.person ? 'Owner: ' + esc(p.person) : '', p.details.start ? 'Start ' + esc(fmtDate(p.details.start)) : '', p.date ? 'Target ' + esc(fmtDate(p.date)) : ''].filter(Boolean).join(' · ')}</div>
  </div>
  ${groups.length ? groups.map(([st, l]) => `<div class="day-h">${TASK_STATUS[st]} (${l.length})</div><div class="list">${l.map(k => taskItem(k)).join('')}</div>`).join('')
    : `<div class="card empty section">No tasks yet. Add the first one.</div>`}
  <button class="fab" data-act="add-task" data-id="${id}" aria-label="Add task">${I.plus}</button>`;
}

function reportsView() {
  header('Reports', 'Insights', true);
  const m = ui.report.month;
  const t = monthTotals(m);
  const cats = {};
  for (const r of personalFamily()) if (r.type === 'expense' && r.date?.startsWith(m)) cats[r.category || 'Other'] = (cats[r.category || 'Other'] || 0) + r.amount;
  if (t.groupShare) cats['Group share'] = t.groupShare;
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxCat = catList[0]?.[1] || 1;
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5));
  const series = months.map(mm => { const x = monthTotals(mm); return { m: mm, inc: x.income, exp: x.spend }; });
  const { recv, pay, people } = myDues();
  const ps = ofType('project'); const allTasks = ofType('task');
  const odTasks = allTasks.filter(k => k.status !== 'done' && k.date && k.date < today()).length;
  const b = S.details.budget;
  return `
  <div class="monthnav" style="margin-top:4px"><button class="icon-btn" data-act="rmonth" data-v="-1" aria-label="Previous month">${I.left}</button><b>${fmtMonth(m)}</b><button class="icon-btn" data-act="rmonth" data-v="1" aria-label="Next month">${I.right}</button></div>
  <div class="grid3">
    <div class="card stat"><div class="label">Income</div><div class="val pos num" style="font-size:16px">${money(t.income)}</div></div>
    <div class="card stat"><div class="label">Spending</div><div class="val num" style="font-size:16px">${money(t.spend)}</div></div>
    <div class="card stat"><div class="label">Saved</div><div class="val num ${t.income - t.spend < 0 ? 'neg' : ''}" style="font-size:16px">${money(t.income - t.spend)}</div></div>
  </div>
  <div class="card section">
    <h2>Spending split</h2>
    <div class="kv"><span>Personal</span><b class="num">${money(t.personal)}</b></div>
    <div class="kv"><span>Family</span><b class="num">${money(t.family)}</b></div>
    <div class="kv"><span>Your share in groups</span><b class="num">${money(t.groupShare)}</b></div>
    ${b ? `<div class="kv"><span>Budget used</span><b class="num ${t.spend > b ? 'neg' : ''}">${Math.round(t.spend / b * 100)}% of ${money(b)}</b></div>` : ''}
  </div>
  <div class="card section">
    <h2>By category</h2>
    ${catList.length ? catList.map(([c, v]) => `<div class="catbar"><div class="top"><span>${esc(c)}</span><b class="num">${money(v)}</b></div><div class="bar"><i style="width:${Math.max(2, v / maxCat * 100)}%"></i></div></div>`).join('') : '<div class="empty">No expenses this month.</div>'}
  </div>
  <div class="card section chart">
    <h2 style="margin-bottom:10px">Last 6 months</h2>
    ${trendChart(series)}
    <div class="legend"><span><i style="background:var(--accent-2)"></i>Income</span><span><i style="background:var(--amber)"></i>Spending</span></div>
  </div>
  <div class="card section">
    <h2>Outstanding balances</h2>
    <div class="kv"><span>To receive</span><b class="pos num">${money(recv)}</b></div>
    <div class="kv"><span>To pay</span><b class="neg num">${money(pay)}</b></div>
    ${people.map(d => `<div class="kv small"><span>${esc(d.from)} → ${esc(d.to)} <span class="muted">(${esc(d.group.title)})</span></span><span class="num">${money(d.amount)}</span></div>`).join('')}
  </div>
  <div class="card section">
    <h2>Projects</h2>
    <div class="kv"><span>Active projects</span><b>${ps.filter(p => p.status !== 'completed').length}</b></div>
    <div class="kv"><span>Completed projects</span><b>${ps.filter(p => p.status === 'completed').length}</b></div>
    <div class="kv"><span>Open tasks</span><b>${allTasks.filter(k => k.status !== 'done').length}</b></div>
    <div class="kv"><span>Overdue tasks</span><b class="${odTasks ? 'neg' : ''}">${odTasks}</b></div>
  </div>
  <div class="btn-row section"><button class="btn ghost" data-act="csv" data-v="month">Export month (CSV)</button><button class="btn ghost" data-act="csv" data-v="all">Export all (CSV)</button></div>`;
}

function trendChart(series) {
  const W = 320, H = 160, P = 22, max = Math.max(1, ...series.flatMap(s => [s.inc, s.exp]));
  const bw = (W - P) / series.length;
  const y = v => H - 18 - (v / max) * (H - 30);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending, last 6 months">
    <line x1="${P}" x2="${W}" y1="${H - 18}" y2="${H - 18}" stroke="var(--line)"/>
    ${series.map((s, i) => {
      const x = P + i * bw + bw / 2;
      const lbl = new Date(+s.m.slice(0, 4), +s.m.slice(5) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
      return `<rect x="${x - 13}" y="${y(s.inc)}" width="12" height="${H - 18 - y(s.inc)}" rx="3" fill="var(--accent-2)"><title>Income ${money(s.inc)}</title></rect>
        <rect x="${x + 1}" y="${y(s.exp)}" width="12" height="${H - 18 - y(s.exp)}" rx="3" fill="var(--amber)"><title>Spending ${money(s.exp)}</title></rect>
        <text x="${x}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${lbl}</text>`;
    }).join('')}
  </svg>`;
}

function settingsView() {
  header('Settings', 'Preferences & data', true);
  const d = S.details;
  const counts = {};
  R.forEach(r => counts[r.type] = (counts[r.type] || 0) + 1);
  return `
  <form class="card" id="settings-form">
    <h2 style="margin-bottom:12px">Profile</h2>
    <label class="field"><span>Your name</span><input name="name" value="${esc(d.name)}" placeholder="e.g. Vijay"></label>
    <div class="row2">
      <label class="field"><span>Currency symbol</span><input name="currency" value="${esc(d.currency)}" maxlength="4"></label>
      <label class="field"><span>Monthly budget</span><input name="budget" inputmode="decimal" value="${esc(fromPaise(d.budget))}"></label>
    </div>
    <label class="field"><span>Family members (comma separated, first is you)</span><input name="members" value="${esc(d.members.join(', '))}"></label>
    <label class="field"><span>Expense categories</span><textarea name="expenseCategories">${esc(d.expenseCategories.join(', '))}</textarea></label>
    <label class="field"><span>Income categories</span><input name="incomeCategories" value="${esc(d.incomeCategories.join(', '))}"></label>
    <label class="field"><span>Payment modes</span><input name="paymentModes" value="${esc(d.paymentModes.join(', '))}"></label>
    <h2 style="margin:18px 0 6px">Reminder emails</h2>
    <p class="muted small" style="margin:0 0 10px">When connected, your GitHub robot emails each reminder to the person it is “For” (checked every 30 minutes) and a morning summary at about 7 AM — even when the app is closed.</p>
    ${d.members.map((m, i) => `<label class="field"><span>${esc(m)}</span><input type="email" name="email_${i}" value="${esc((d.emails || {})[m] || '')}" placeholder="name@gmail.com"></label>`).join('')}
    <button class="btn block">Save settings</button>
  </form>
  <div class="card section">
    <h2 style="margin-bottom:6px">GitHub sync</h2>
    ${CONN ? `<p class="muted small" style="margin:0 0 12px">Connected to <b>${esc(CONN.repo)}</b>. <b id="sync-state">${esc(syncState)}</b><br>Changes on any family phone appear on the others within about 30 seconds.</p>
    <div class="btn-row"><button class="btn" data-act="sync">Sync now</button><button class="btn ghost" data-act="connect">Change connection</button></div>
    <div class="btn-row" style="margin-top:10px"><button class="btn ghost" data-act="test-email">Send test email</button><button class="btn ghost" data-act="robot-backup">Back up now</button></div>
    <button class="btn ghost block" data-act="install-robot" style="margin-top:10px">Install / update email robot</button>
    <button class="btn danger block" data-act="disconnect" style="margin-top:10px">Disconnect this phone</button>`
    : `<p class="muted small" style="margin:0 0 12px">Not connected - data is only on this phone. Connect to share with your family and get reminder emails.</p><button class="btn block" data-act="connect">Connect to GitHub</button>`}
  </div>
  <div class="card section">
    <h2 style="margin-bottom:6px">Notifications</h2>
    <p class="muted small" style="margin:0 0 12px">Status: <b>${'Notification' in window ? Notification.permission : 'not supported on this browser'}</b>. Alerts appear while the app is open or recently used. For guaranteed alarms, use “Add to calendar” on a reminder.</p>
    <div class="btn-row"><button class="btn ghost" data-act="perm">Enable notifications</button><button class="btn ghost" data-act="test-notif">Send test</button></div>
  </div>
  <div class="card section">
    <h2 style="margin-bottom:6px">Backup & restore</h2>
    <p class="muted small" style="margin:0 0 12px">A copy of all data is kept on this phone (one built-in table)${CONN ? ' and in your private GitHub repository (with full history)' : ''}. Last file backup: <b>${d.lastBackup ? new Date(d.lastBackup).toLocaleString('en-IN') : 'never'}</b>.</p>
    <div class="btn-row"><button class="btn" data-act="backup">Export backup (JSON)</button><button class="btn ghost" data-act="import">Import backup</button></div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
  </div>
  <div class="card section">
    <h2 style="margin-bottom:6px">App</h2>
    ${deferredInstall ? '<button class="btn block" data-act="install" style="margin-bottom:12px">Install app on this device</button>' : ''}
    <div class="kv"><span>Version</span><b>${APP_VERSION}</b></div>
    <div class="kv"><span>Website</span><a href="${esc(location.origin + location.pathname)}">${esc(location.host || 'local')}</a></div>
    <div class="kv"><span>Records stored</span><b>${R.length}</b></div>
    <div class="kv small muted"><span>${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span></div>
    <div class="kv"><span>Storage</span><b>${CONN ? 'Phone + GitHub' : 'This phone only'}</b></div>
    <button class="btn danger block" data-act="wipe" style="margin-top:14px">Delete all data</button>
  </div>`;
}

/* ---------- sheet (forms) ---------- */
function openSheet(title, body, onSubmit, opts = {}) {
  const el = $('#sheet');
  el.innerHTML = `<div class="backdrop" data-act="close"></div>
    <form class="panel" novalidate><div class="grab"></div><h2>${esc(title)}</h2>${body}
      <div class="btn-row" style="margin-top:8px">${opts.del ? `<button type="button" class="btn danger" data-act="sheet-del">Delete</button>` : ''}${opts.extra || ''}<button class="btn">${esc(opts.submit || 'Save')}</button></div></form>`;
  const f = $('form', el);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { const ok = await onSubmit(new FormData(f), f); if (ok !== false) { closeSheet(); render(); } }
    catch (err) { console.error(err); alert(err.message || 'Something went wrong'); }
  });
  if (opts.del) $('[data-act="sheet-del"]', el).addEventListener('click', async () => { if (confirm('Delete this item?')) { await opts.del(); closeSheet(); render(); } });
  opts.onOpen?.(f);
  const first = $('input:not([type=hidden]):not([type=checkbox]),textarea', f); if (first && !opts.noFocus) setTimeout(() => first.focus(), 60);
}
function closeSheet() { $('#sheet').innerHTML = ''; }

function txnForm(rec, type = 'expense') {
  const r = rec || { type, date: today(), details: { book: 'personal', paidBy: ME, mode: 'UPI' } };
  const d = S.details;
  const cats = r.type === 'income' ? d.incomeCategories : d.expenseCategories;
  openSheet(rec ? 'Edit transaction' : r.type === 'income' ? 'Add income' : 'Add expense', `
    <div class="seg" style="margin-bottom:14px"><button type="button" class="${r.type === 'expense' ? 'on' : ''}" data-tt="expense">Expense</button><button type="button" class="${r.type === 'income' ? 'on' : ''}" data-tt="income">Income</button></div>
    <input type="hidden" name="type" value="${r.type}">
    <label class="field"><span>Amount</span><input name="amount" class="amount" inputmode="decimal" placeholder="0" value="${esc(fromPaise(r.amount))}" required></label>
    <label class="field"><span>Description</span><input name="title" value="${esc(r.title)}" placeholder="e.g. Weekly groceries"></label>
    <div class="row2">
      <label class="field"><span>Category</span><select name="category">${cats.map(c => opt(c, c, r.category)).join('')}</select></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(r.date)}" required></label>
    </div>
    <div class="row2">
      <label class="field"><span>Account</span><select name="book">${opt('personal', 'Personal', r.details.book)}${opt('family', 'Family', r.details.book)}</select></label>
      <label class="field"><span>Payment mode</span><select name="mode">${d.paymentModes.map(m => opt(m, m, r.details.mode)).join('')}</select></label>
    </div>
    <label class="field" data-show="family"><span>${r.type === 'income' ? 'Received by' : 'Paid by'}</span><select name="paidBy">${d.members.map(m => opt(m, m, r.details.paidBy)).join('')}</select></label>
    <label class="field"><span>Notes</span><textarea name="notes" placeholder="Optional">${esc(r.details.notes)}</textarea></label>`,
    async fd => {
      const amount = toPaise(fd.get('amount'));
      if (!(amount > 0)) { alert('Enter a valid amount'); return false; }
      const t = fd.get('type');
      const book = fd.get('book');
      await save({ ...r, id: r.id || uid(t), type: t, amount, title: fd.get('title').trim() || fd.get('category'), category: fd.get('category'), date: fd.get('date'), status: 'completed',
        person: book === 'family' ? fd.get('paidBy') : ME,
        details: { ...r.details, book, mode: fd.get('mode'), paidBy: book === 'family' ? fd.get('paidBy') : ME, notes: fd.get('notes').trim() } });
      toast('Saved');
    },
    {
      del: rec ? () => removeIds([rec.id]) : null,
      onOpen: f => {
        const sync = () => { $('[data-show="family"]', f).style.display = f.book.value === 'family' ? '' : 'none'; };
        f.book.addEventListener('change', sync); sync();
        f.querySelectorAll('[data-tt]').forEach(b => b.addEventListener('click', () => {
          const tt = b.dataset.tt; f.type.value = tt;
          f.querySelectorAll('[data-tt]').forEach(x => x.classList.toggle('on', x === b));
          const list = tt === 'income' ? d.incomeCategories : d.expenseCategories;
          f.category.innerHTML = list.map(c => opt(c, c)).join('');
        }));
      }
    });
}

function groupForm(rec) {
  const g = rec || { details: { members: [ME] } };
  openSheet(rec ? 'Edit group' : 'New group', `
    <label class="field"><span>Group name</span><input name="title" value="${esc(g.title)}" placeholder="e.g. Goa trip, Flatmates" required></label>
    <label class="field"><span>Members — one per line (“Me” is always included)</span><textarea name="members" rows="5" placeholder="Ravi&#10;Anita&#10;Suresh">${esc(g.details.members.filter(m => m !== ME).join('\n'))}</textarea></label>
    <p class="hint muted">Friends don't need an account — this is your record of shared spending. Use “Remind” to send them a WhatsApp message.</p>`,
    async fd => {
      const title = fd.get('title').trim();
      if (!title) { alert('Enter a group name'); return false; }
      const members = [ME, ...new Set(fd.get('members').split(/[\n,]/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'me'))];
      if (members.length < 2) { alert('Add at least one other member'); return false; }
      if (rec) {
        const bal = groupBalances(rec.id);
        const removed = rec.details.members.filter(m => !members.includes(m));
        const used = removed.filter(m => R.some(r => r.groupId === rec.id && (r.details.paidBy === m || r.details.from === m || r.details.to === m || (r.details.splits || []).some(s => s.person === m))));
        if (used.length) { alert(`Can't remove ${used.join(', ')} — they appear in group expenses${used.some(m => bal[m]) ? ' and have a balance' : ''}.`); return false; }
      }
      const saved = await save({ ...g, id: g.id || uid('group'), type: 'group', title, status: 'active', details: { ...g.details, members } });
      if (!rec) { closeSheet(); go('group/' + saved.id); return false; }
    },
    { del: rec ? async () => { await removeIds(R.filter(r => r.groupId === rec.id).map(r => r.id).concat(rec.id)); go('groups'); } : null });
}

function groupExpenseForm(gid, rec) {
  const g = byId(gid);
  const e = rec || { date: today(), details: { paidBy: ME, splitMethod: 'equal', splits: g.details.members.map(p => ({ person: p, share: 0 })) } };
  const splitMap = Object.fromEntries((e.details.splits || []).map(s => [s.person, s]));
  openSheet(rec ? 'Edit expense' : 'Add group expense', `
    <label class="field"><span>Amount</span><input name="amount" class="amount" inputmode="decimal" placeholder="0" value="${esc(fromPaise(e.amount))}"></label>
    <label class="field"><span>Description</span><input name="title" value="${esc(e.title)}" placeholder="e.g. Dinner at restaurant"></label>
    <div class="row2">
      <label class="field"><span>Paid by</span><select name="paidBy">${g.details.members.map(m => opt(m, m, e.details.paidBy)).join('')}</select></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(e.date)}"></label>
    </div>
    <label class="field"><span>Split</span><select name="splitMethod">${opt('equal', 'Equally', e.details.splitMethod)}${opt('exact', 'By exact amounts', e.details.splitMethod)}${opt('percent', 'By percentage', e.details.splitMethod)}</select></label>
    <div id="splits">${g.details.members.map(m => {
      const s = splitMap[m];
      const v = e.details.splitMethod === 'exact' ? fromPaise(s?.share) : e.details.splitMethod === 'percent' ? (s?.pct ?? '') : '';
      return `<div class="split-row"><label><input type="checkbox" name="p" value="${esc(m)}" ${!rec || s ? 'checked' : ''}>${esc(m)}</label><input type="number" step="0.01" min="0" data-v="${esc(m)}" value="${esc(v)}" placeholder="0"><span class="small muted" data-eq="${esc(m)}"></span></div>`;
    }).join('')}</div>
    <p class="hint muted" id="split-hint"></p>`,
    async (fd, f) => {
      const amount = toPaise(fd.get('amount'));
      if (!(amount > 0)) { alert('Enter a valid amount'); return false; }
      const method = fd.get('splitMethod');
      const people = fd.getAll('p');
      if (!people.length) { alert('Select at least one person'); return false; }
      let splits;
      if (method === 'equal') {
        const base = Math.floor(amount / people.length); let rem = amount - base * people.length;
        splits = people.map(p => ({ person: p, share: base + (rem-- > 0 ? 1 : 0) }));
      } else if (method === 'exact') {
        splits = people.map(p => ({ person: p, share: toPaise($(`[data-v="${CSS.escape(p)}"]`, f).value || 0) }));
        const sum = splits.reduce((s, x) => s + x.share, 0);
        if (sum !== amount) { alert(`Shares add up to ${money(sum)}, but the bill is ${money(amount)}.`); return false; }
      } else {
        const pcts = people.map(p => Number($(`[data-v="${CSS.escape(p)}"]`, f).value || 0));
        const tot = pcts.reduce((a, b) => a + b, 0);
        if (Math.abs(tot - 100) > 0.001) { alert(`Percentages add up to ${tot}%, they must total 100%.`); return false; }
        let acc = 0;
        splits = people.map((p, i) => { const share = i === people.length - 1 ? amount - acc : Math.round(amount * pcts[i] / 100); acc += share; return { person: p, share, pct: pcts[i] }; });
      }
      await save({ ...e, id: e.id || uid('expense'), type: 'expense', groupId: gid, amount, title: fd.get('title').trim() || 'Expense', date: fd.get('date') || today(), status: 'completed', category: 'Group',
        person: fd.get('paidBy'), details: { ...e.details, paidBy: fd.get('paidBy'), splitMethod: method, splits } });
      toast('Expense added');
    },
    {
      del: rec ? () => removeIds([rec.id]) : null,
      onOpen: f => {
        const upd = () => {
          const method = f.splitMethod.value, amount = toPaise(f.amount.value) || 0;
          const people = [...f.querySelectorAll('[name=p]:checked')].map(x => x.value);
          f.querySelectorAll('[data-v]').forEach(inp => { inp.style.display = method === 'equal' ? 'none' : ''; inp.disabled = !people.includes(inp.dataset.v); });
          f.querySelectorAll('[data-eq]').forEach(sp => { sp.textContent = method === 'equal' && people.includes(sp.dataset.eq) && people.length ? money(Math.floor(amount / people.length)) : ''; });
          let hint = '';
          if (method === 'exact') { const sum = people.reduce((s, p) => s + (toPaise($(`[data-v="${CSS.escape(p)}"]`, f).value || 0) || 0), 0); hint = `Assigned ${money(sum)} of ${money(amount)} · ${money(amount - sum)} left`; }
          if (method === 'percent') { const sum = people.reduce((s, p) => s + Number($(`[data-v="${CSS.escape(p)}"]`, f).value || 0), 0); hint = `Total ${Math.round(sum * 100) / 100}% (must be 100%)`; }
          $('#split-hint', f).textContent = hint;
        };
        f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
      }
    });
}

function settleForm(gid, rec, pre = {}) {
  const g = byId(gid);
  const s = rec || { date: today(), amount: pre.a ? Number(pre.a) : null, details: { from: pre.from || g.details.members.find(m => m !== ME), to: pre.to || ME, mode: 'UPI' } };
  openSheet(rec ? 'Edit payment' : 'Record payment', `
    <div class="row2">
      <label class="field"><span>Who paid</span><select name="from">${g.details.members.map(m => opt(m, m, s.details.from)).join('')}</select></label>
      <label class="field"><span>Paid to</span><select name="to">${g.details.members.map(m => opt(m, m, s.details.to)).join('')}</select></label>
    </div>
    <label class="field"><span>Amount</span><input name="amount" class="amount" inputmode="decimal" value="${esc(fromPaise(s.amount))}" placeholder="0"></label>
    <p class="hint muted">Partial payments are fine — balances update automatically.</p>
    <div class="row2">
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(s.date)}"></label>
      <label class="field"><span>Mode</span><select name="mode">${S.details.paymentModes.map(m => opt(m, m, s.details.mode)).join('')}</select></label>
    </div>
    <label class="field"><span>Note</span><input name="notes" value="${esc(s.details.notes)}" placeholder="Optional"></label>`,
    async fd => {
      const amount = toPaise(fd.get('amount'));
      if (!(amount > 0)) { alert('Enter a valid amount'); return false; }
      if (fd.get('from') === fd.get('to')) { alert('Payer and receiver must be different'); return false; }
      await save({ ...s, id: s.id || uid('settlement'), type: 'settlement', groupId: gid, amount, title: `${fd.get('from')} → ${fd.get('to')}`, date: fd.get('date') || today(), status: 'completed',
        person: fd.get('from'), details: { ...s.details, from: fd.get('from'), to: fd.get('to'), mode: fd.get('mode'), notes: fd.get('notes').trim() } });
      toast('Payment recorded');
    }, { del: rec ? () => removeIds([rec.id]) : null, noFocus: !!pre.a });
}

function reminderForm(rec) {
  const r = rec || { date: today(), status: 'pending', details: { time: '09:00', repeat: 'none', before: 0, priority: 'medium' } };
  openSheet(rec ? 'Edit reminder' : 'New reminder', `
    <label class="field"><span>Title</span><input name="title" value="${esc(r.title)}" placeholder="e.g. Pay electricity bill" required></label>
    <div class="row2">
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(r.date)}"></label>
      <label class="field"><span>Time</span><input type="time" name="time" value="${esc(r.details.time)}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Repeat</span><select name="repeat">${Object.entries(REPEAT).map(([k, v]) => opt(k, v, r.details.repeat)).join('')}</select></label>
      <label class="field"><span>Alert</span><select name="before">${Object.entries(BEFORE).map(([k, v]) => opt(k, v, r.details.before)).join('')}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Amount (optional)</span><input name="amount" inputmode="decimal" value="${esc(fromPaise(r.amount))}" placeholder="For bills"></label>
      <label class="field"><span>Priority</span><select name="priority">${Object.entries(PRIORITY).map(([k, v]) => opt(k, v, r.details.priority)).join('')}</select></label>
    </div>
    <label class="field"><span>For</span><select name="person">${S.details.members.map(m => opt(m, m, r.person || ME)).join('')}</select></label>
    <label class="field"><span>Notes</span><textarea name="notes" placeholder="Optional">${esc(r.details.notes)}</textarea></label>`,
    async fd => {
      const title = fd.get('title').trim();
      if (!title) { alert('Enter a title'); return false; }
      const amt = fd.get('amount') ? toPaise(fd.get('amount')) : null;
      if (amt !== null && !(amt >= 0)) { alert('Amount is not valid'); return false; }
      const date = fd.get('date') || today();
      const changedTime = !rec || rec.date !== date || rec.details.time !== fd.get('time');
      await save({ ...r, id: r.id || uid('reminder'), type: 'reminder', title, date, amount: amt, person: fd.get('person'), status: rec?.status === 'completed' && changedTime ? 'pending' : r.status,
        details: { ...r.details, time: fd.get('time') || '09:00', repeat: fd.get('repeat'), before: Number(fd.get('before')), priority: fd.get('priority'), notes: fd.get('notes').trim(),
          anchorDay: Number(date.slice(8)), notified: changedTime ? null : r.details.notified } });
      toast('Reminder saved');
    },
    {
      del: rec ? () => removeIds([rec.id]) : null,
      extra: rec ? '<button type="button" class="btn ghost" data-act="ics">Add to calendar</button>' : '',
      onOpen: f => { const b = $('[data-act="ics"]', f); if (b) b.addEventListener('click', async e => {
        e.stopPropagation();
        download(`${rec.title.replace(/[^\w]+/g, '_')}.ics`, icsFor(rec), 'text/calendar');
        toast('Open the downloaded file to add it to your phone calendar');
      }); }
    });
}

function projectForm(rec) {
  const p = rec || { status: 'not_started', person: ME, details: { start: today() } };
  openSheet(rec ? 'Edit project' : 'New project', `
    <label class="field"><span>Project name</span><input name="title" value="${esc(p.title)}" required></label>
    <label class="field"><span>Description</span><textarea name="description">${esc(p.details.description)}</textarea></label>
    <div class="row2">
      <label class="field"><span>Status</span><select name="status">${Object.entries(PROJ_STATUS).map(([k, v]) => opt(k, v, p.status)).join('')}</select></label>
      <label class="field"><span>Owner</span><input name="person" value="${esc(p.person)}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Start date</span><input type="date" name="start" value="${esc(p.details.start)}"></label>
      <label class="field"><span>Target date</span><input type="date" name="date" value="${esc(p.date)}"></label>
    </div>`,
    async fd => {
      const title = fd.get('title').trim();
      if (!title) { alert('Enter a project name'); return false; }
      const saved = await save({ ...p, id: p.id || uid('project'), type: 'project', title, status: fd.get('status'), person: fd.get('person').trim(), date: fd.get('date') || null,
        details: { ...p.details, description: fd.get('description').trim(), start: fd.get('start') || null } });
      if (!rec) { closeSheet(); go('project/' + saved.id); return false; }
    },
    { del: rec ? async () => { await removeIds(R.filter(r => r.parentId === rec.id).map(r => r.id).concat(rec.id)); go('projects'); } : null });
}

function taskForm(pid, rec) {
  const projects = ofType('project').filter(p => p.status !== 'completed' || p.id === pid);
  if (!projects.length) { if (confirm('Create a project first?')) projectForm(); return; }
  const k = rec || { parentId: pid || projects[0].id, status: 'todo', person: ME, details: { priority: 'medium' } };
  openSheet(rec ? 'Edit task' : 'New task', `
    <label class="field"><span>Task</span><input name="title" value="${esc(k.title)}" required></label>
    <label class="field"><span>Project</span><select name="parentId">${projects.map(p => opt(p.id, p.title, k.parentId)).join('')}</select></label>
    <div class="row2">
      <label class="field"><span>Status</span><select name="status">${Object.entries(TASK_STATUS).map(([a, b]) => opt(a, b, k.status)).join('')}</select></label>
      <label class="field"><span>Priority</span><select name="priority">${Object.entries(PRIORITY).map(([a, b]) => opt(a, b, k.details.priority)).join('')}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Due date</span><input type="date" name="date" value="${esc(k.date)}"></label>
      <label class="field"><span>Assigned to</span><input name="person" value="${esc(k.person)}"></label>
    </div>
    <label class="field"><span>Notes / checklist</span><textarea name="notes" placeholder="- step one&#10;- step two">${esc(k.details.notes)}</textarea></label>`,
    async fd => {
      const title = fd.get('title').trim();
      if (!title) { alert('Enter a task name'); return false; }
      await save({ ...k, id: k.id || uid('task'), type: 'task', title, parentId: fd.get('parentId'), status: fd.get('status'), person: fd.get('person').trim(), date: fd.get('date') || null,
        details: { ...k.details, priority: fd.get('priority'), notes: fd.get('notes').trim(), notified: rec && rec.date === fd.get('date') ? k.details.notified : null } });
      toast('Task saved');
    }, { del: rec ? () => removeIds([rec.id]) : null });
}

/* ---------- actions ---------- */
async function markReminderDone(r) {
  if (r.status === 'completed') { r.status = 'pending'; await save(r); render(); return; }
  if (r.amount && confirm(`Also record ${money(r.amount)} as an expense?`)) {
    await save({ id: uid('expense'), type: 'expense', title: r.title, amount: r.amount, date: today(), category: S.details.expenseCategories.includes('Bills & Utilities') ? 'Bills & Utilities' : S.details.expenseCategories[0],
      status: 'completed', person: ME, details: { book: 'personal', paidBy: ME, mode: S.details.paymentModes[0], notes: 'From reminder' } });
  }
  if (r.details.repeat && r.details.repeat !== 'none') {
    r.details.lastDone = today();
    let n = nextDate(r.date, r.details.repeat, r.details.anchorDay);
    while (n < today()) n = nextDate(n, r.details.repeat, r.details.anchorDay);
    r.date = n; r.details.notified = null;
    toast(`Done · next on ${fmtDate(n)}`);
  } else { r.status = 'completed'; toast('Marked as done'); }
  await save(r); render();
}

function exportBackup() {
  const data = { app: 'lifemanager', version: APP_VERSION, exportedAt: new Date().toISOString(), records: R };
  download(`lifemanager-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  S.details.lastBackup = new Date().toISOString();
  save(S).then(render);
  toast('Backup downloaded');
}
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { alert('This file is not a valid backup.'); return; }
  const recs = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(recs) || !recs.every(r => r && typeof r.id === 'string' && typeof r.type === 'string')) { alert('This file is not a LifeManager backup.'); return; }
  const replace = confirm(`Backup contains ${recs.length} records.\n\nOK = Replace ALL data${CONN ? ' (also on GitHub, for everyone)' : ' on this phone'}\nCancel = Merge into existing data`);
  if (CONN) {
    toast('Importing...');
    try {
      const remote = await readRemote();
      const map = new Map((replace ? [] : remote.records).map(x => [x.id, x]));
      recs.forEach(x => map.set(x.id, x));
      await writeRemote([...map.values()], remote.sha, 'LifeManager: import backup');
      CONN.sha = null; ls.set('lm_outbox', {}); ls.set('lm_deleted', []);
      await syncNow(false); render(); toast('Backup imported');
    } catch (e) { alert('Import failed: ' + e.message); }
    return;
  }
  if (replace) await DB.clear();
  await DB.putMany(recs);
  await load();
  render(); toast('Backup restored');
}
function exportCSV(scope) {
  const m = ui.report.month;
  const rows = R.filter(r => ['expense', 'income', 'settlement'].includes(r.type) && (scope === 'all' || r.date?.startsWith(m)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const head = ['Date', 'Type', 'Description', 'Category', 'Account/Group', 'Paid by', 'Amount', 'My share', 'Payment mode', 'Notes'];
  const lines = rows.map(r => {
    const grp = r.groupId ? byId(r.groupId)?.title : (r.details.book === 'family' ? 'Family' : 'Personal');
    const my = r.groupId && r.type === 'expense' ? ((r.details.splits || []).find(s => s.person === ME)?.share || 0) / 100 : '';
    return [r.date, r.type, r.title, r.category, grp, r.details.paidBy || r.details.from, r.amount / 100, my, r.details.mode, r.details.notes].map(q).join(',');
  });
  download(`lifemanager-${scope === 'all' ? 'all' : m}.csv`, '﻿' + [head.join(','), ...lines].join('\r\n'), 'text/csv');
}
function nudge(gid, person, amount) {
  const g = byId(gid);
  const text = `Hi ${person}, gentle reminder: ${money(Number(amount))} is pending for "${g.title}". Thanks!`;
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

const ACTIONS = {
  nav: el => go(el.dataset.to),
  back: () => history.length > 1 ? history.back() : go('home'),
  close: closeSheet,
  'add-txn': () => txnForm(null, 'expense'),
  'add-income': () => txnForm(null, 'income'),
  'edit-txn': el => txnForm(byId(el.dataset.id)),
  book: el => { ui.money.book = el.dataset.v; render(); },
  month: el => { ui.money.month = shiftMonth(ui.money.month, +el.dataset.v); render(); },
  rmonth: el => { ui.report.month = shiftMonth(ui.report.month, +el.dataset.v); render(); },
  'add-group': () => groupForm(),
  'edit-group': el => groupForm(byId(el.dataset.id)),
  'add-gexp': el => groupExpenseForm(el.dataset.id),
  'edit-gexp': el => { const r = byId(el.dataset.id); groupExpenseForm(r.groupId, r); },
  'add-settle': el => settleForm(el.dataset.id, null, { from: el.dataset.from, to: el.dataset.to, a: el.dataset.a }),
  'edit-settle': el => { const r = byId(el.dataset.id); settleForm(r.groupId, r); },
  nudge: el => nudge(el.dataset.id, el.dataset.p, el.dataset.a),
  'add-rem': () => reminderForm(),
  'edit-rem': el => reminderForm(byId(el.dataset.id)),
  'done-rem': el => markReminderDone(byId(el.dataset.id)),
  remtab: el => { ui.rem = el.dataset.v; render(); },
  'add-proj': () => projectForm(),
  'edit-proj': el => projectForm(byId(el.dataset.id)),
  'add-task': el => taskForm(el.dataset.id),
  'quick-task': () => taskForm(null),
  'edit-task': el => { const k = byId(el.dataset.id); taskForm(k.parentId, k); },
  'toggle-task': async el => { const k = byId(el.dataset.id); k.status = k.status === 'done' ? 'todo' : 'done'; await save(k); render(); },
  perm: async () => { if (!('Notification' in window)) return alert('Notifications are not supported on this browser. On iPhone, install the app to the Home Screen first.'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications enabled' : 'Notifications not allowed'); render(); },
  'test-notif': () => { if (Notification?.permission !== 'granted') return alert('Enable notifications first.'); notify('LifeManager', 'Notifications are working on this device.', 'test'); },
  backup: exportBackup,
  import: () => $('#import-file').click(),
  csv: el => exportCSV(el.dataset.v),
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; render(); },
  wipe: async () => {
    if (prompt(`Type DELETE to erase all data${CONN ? ' on this phone AND on GitHub (for everyone; history is kept)' : ' on this phone'}. Export a backup first!`) !== 'DELETE') return;
    if (CONN) { try { const remote = await readRemote(); await writeRemote(S ? [S] : [], remote.sha, 'LifeManager: delete all data'); } catch (e) { return alert(e.message); } }
    await DB.clear(); ls.set('lm_outbox', {}); ls.set('lm_deleted', []); await load(); if (CONN) { CONN.sha = null; await syncNow(true); } render(); toast('All data deleted');
  },
  connect: () => connectForm(false),
  sync: async () => { toast('Syncing…'); await syncNow(false); render(); if (!syncState.startsWith('Sync problem')) toast(syncState); },
  disconnect: () => { if (confirm('Disconnect this phone from GitHub? Data stays on GitHub; this phone keeps its copy but stops syncing.')) { disconnectGitHub(); render(); } },
  'test-email': async () => {
    if (!(S.details.emails || {})[ME]) return alert('Enter your email under Reminder emails and tap Save settings first.');
    try { await syncNow(true); await runRobot('test'); toast('Robot started - the test email arrives in 1-2 minutes'); }
    catch (e) { alert('Could not start the email robot: ' + e.message + '\n\nTap "Install / update email robot" and check the token has "Actions: Read and write".'); }
  },
  'robot-backup': async () => { try { await runRobot('backup'); S.details.lastBackup = new Date().toISOString(); await save(S); render(); toast('Backup started - saved in the backups folder on GitHub'); } catch (e) { alert(e.message); } },
  'install-robot': async () => { toast('Installing robot...'); if (await installRobot(CONN)) toast('Email robot installed / up to date'); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACTIONS[el.dataset.act]) return;
  if (el.closest('#sheet form') && !['close'].includes(el.dataset.act) && el.dataset.act !== 'sheet-del' && el.dataset.act !== 'ics') return;
  e.preventDefault(); e.stopPropagation();
  ACTIONS[el.dataset.act](el);
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'settings-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const list = k => [...new Set(fd.get(k).split(',').map(s => s.trim()).filter(Boolean))];
  const budget = fd.get('budget') ? toPaise(fd.get('budget')) : 0;
  if (isNaN(budget) || budget < 0) return alert('Budget is not a valid number');
  const members = list('members');
  members[0] = ME;
  const ec = list('expenseCategories'), ic = list('incomeCategories'), pm = list('paymentModes');
  if (!ec.length || !ic.length || !pm.length) return alert('Categories and payment modes cannot be empty');
  const emails = {};
  S.details.members.forEach((m, i) => { const v = (fd.get('email_' + i) || '').trim(); if (v) emails[m] = v; });
  for (const v of Object.values(emails)) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return alert('Invalid email: ' + v);
  Object.assign(S.details, { emails, name: fd.get('name').trim(), currency: fd.get('currency').trim() || '₹', budget, members: [...new Set(members)], expenseCategories: ec, incomeCategories: ic, paymentModes: pm });
  await save(S); toast('Settings saved'); render();
});
document.addEventListener('change', e => { if (e.target.id === 'import-file' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', () => { closeSheet(); render(); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });

/* ---------- boot ---------- */
async function load() {
  R = await DB.all();
  S = R.find(r => r.id === 'SETTINGS');
  if (!S) S = await save(DEFAULT_SETTINGS());
  ensureSettings();
}
(async function init() {
  try {
    await load();
    render();
    navigator.storage?.persist?.();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    checkReminders();
    setInterval(checkReminders, 30000);
    setInterval(() => { if (!$('#sheet').innerHTML && route().view === 'home') render(); }, 60000);
    if (CONN) syncNow(true); else if (!ls.get('lm_skip_connect', false)) connectForm(true);
    setInterval(() => { if (!document.hidden) syncNow(true); }, 30000);
    window.addEventListener('online', () => syncNow(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); syncNow(true); if (!$('#sheet').innerHTML) render(); } });
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `<div class="card empty">Storage is unavailable in this browser (private mode?). ${esc(err.message)}</div>`;
  }
})();
