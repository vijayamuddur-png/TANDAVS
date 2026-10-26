/* LifeManager Pro — storage (one table), GitHub sync, logins & privacy */
'use strict';

/* ---------- IndexedDB: ONE object store "records" ---------- */
const DB = (() => {
  const NAME = 'lifemanager', VERSION = 1, STORE = 'records';
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) { const s = db.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('type', 'type'); }
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); let out; Promise.resolve(fn(t.objectStore(STORE))).then(v => out = v, rej); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    all: () => run('readonly', s => req(s.getAll())),
    put: rec => run('readwrite', s => req(s.put(rec))),
    delMany: ids => run('readwrite', s => Promise.all(ids.map(id => req(s.delete(id))))),
    putMany: recs => run('readwrite', s => Promise.all(recs.map(r => req(s.put(r))))),
    clear: () => run('readwrite', s => req(s.clear())),
    replaceAll: recs => run('readwrite', s => req(s.clear()).then(() => Promise.all(recs.map(r => req(s.put(r))))))
  };
})();

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } }
};

/* ---------- state ---------- */
let R = [];          /* every record (single table) */
let SET = null;      /* household settings */
let USER = null;     /* logged-in user record */
let PREFS = null;    /* logged-in user's preferences record */

const byId = id => R.find(r => r.id === id);
const users = (all = false) => R.filter(r => r.type === 'user' && (all || r.details.active !== false)).sort((a, b) => (a.details.role === 'admin' ? -1 : 0) - (b.details.role === 'admin' ? -1 : 0) || a.title.localeCompare(b.title));
const userName = id => byId(id)?.title || 'Someone';
const isAdmin = () => USER?.details.role === 'admin';

const DEFAULT_SETTINGS = () => ({
  id: 'SETTINGS', type: 'settings', title: 'Household', scope: 'family', owner: null,
  details: {
    familyName: 'My Family', currency: '₹',
    expenseCategories: ['Groceries', 'Rent', 'Bills & Utilities', 'Food & Dining', 'Travel', 'Fuel', 'Shopping', 'Health', 'Education', 'Entertainment', 'EMI & Loans', 'Insurance', 'Kids', 'Household', 'Mobile & Internet', 'Subscriptions', 'Personal care', 'Gifts', 'Big purchase', 'Other'],
    incomeCategories: ['Salary', 'Business', 'Interest', 'Rental income', 'Refund', 'Gift', 'Other'],
    paymentModes: ['UPI', 'Cash', 'Debit card', 'Credit card', 'Bank transfer'],
    familyBudget: 0, familyCatBudgets: {}, familyOpening: 0, familyStartMonth: null
  }
});
const DEFAULT_PREFS = uidv => ({
  id: 'PREFS-' + uidv, type: 'prefs', title: 'Preferences', owner: uidv, scope: 'personal',
  details: { theme: 'grape', mode: 'auto', font: 'm', budget: 0, catBudgets: {}, opening: 0, startMonth: null }
});

/* ---------- privacy: who can see what ---------- */
function canSeeGroup(g) { return !!USER && (g.owner === USER.id || (g.details.members || []).some(m => m.userId === USER.id)); }
function canSee(r) {
  if (!USER || !r) return false;
  if (r.type === 'settings' || r.type === 'user') return true;
  if (r.type === 'prefs') return r.owner === USER.id;
  if (r.type === 'group') return canSeeGroup(r);
  if (r.groupId) { const g = byId(r.groupId); return !!g && canSeeGroup(g); }
  if (r.type === 'task' && r.details?.assignee === USER.id) return true;
  if (r.parentId && ['installment', 'goalsave', 'task', 'cardpay'].includes(r.type)) { const p = byId(r.parentId); if (p) return canSee(p); }
  if (r.type === 'reminder' && r.details?.forUser === USER.id) return true;
  if (r.scope === 'family') return true;
  return r.owner === USER.id;
}
const V = (type, f) => R.filter(r => r.type === type && canSee(r) && (!f || f(r)));

/* ---------- saving ---------- */
async function save(rec) {
  const now = new Date().toISOString();
  rec.createdAt = rec.createdAt || now;
  rec.updatedAt = now;
  rec.updatedBy = USER?.id || null;
  if (!('owner' in rec)) rec.owner = USER?.id || null;
  if (!rec.scope) rec.scope = 'personal';
  for (const k of ['title', 'amount', 'date', 'status', 'category', 'groupId', 'parentId']) if (!(k in rec)) rec[k] = null;
  rec.details = rec.details || {};
  await DB.put(rec);
  const i = R.findIndex(r => r.id === rec.id);
  if (i >= 0) R[i] = rec; else R.push(rec);
  if (rec.id === 'SETTINGS') SET = rec;
  if (USER && rec.id === USER.id) USER = rec;
  if (PREFS && rec.id === PREFS.id) PREFS = rec;
  outboxAdd([rec.id]);
  return rec;
}
async function removeIds(ids) {
  ids = [...new Set(ids)];
  await DB.delMany(ids);
  R = R.filter(r => !ids.includes(r.id));
  deletedAdd(ids);
}
const childrenOf = id => R.filter(r => r.parentId === id || r.groupId === id).map(r => r.id);

/* ---------- passwords (PBKDF2, never stored in plain text) ---------- */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(password, salt) {
  if (!crypto?.subtle) throw new Error('This browser cannot do secure login (open the app over https).');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
async function setPassword(user, password) {
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters.');
  user.details.salt = newSalt();
  user.details.hash = await hashPassword(password, user.details.salt);
}
async function createUser({ name, username, password, role, email }) {
  username = String(username || '').trim().toLowerCase();
  if (!name?.trim()) throw new Error('Enter a name.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username: 3-30 letters/numbers, no spaces.');
  if (R.some(r => r.type === 'user' && r.details.username === username)) throw new Error('That username is already taken.');
  const u = { id: uid('user'), type: 'user', title: name.trim(), scope: 'family', owner: null, details: { username, role: role || 'member', email: (email || '').trim(), active: true, color: PALETTE[R.filter(r => r.type === 'user').length % PALETTE.length] } };
  await setPassword(u, password);
  u.owner = u.id;
  return save(u);
}
async function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  const u = R.find(r => r.type === 'user' && r.details.username === username);
  if (!u || !(await hashPassword(password, u.details.salt) === u.details.hash)) throw new Error('Wrong username or password.');
  if (u.details.active === false) throw new Error('This login has been disabled by the admin.');
  startSession(u);
}
function startSession(u) {
  USER = u; ls.set('lm_session', { userId: u.id, at: Date.now() });
  PREFS = R.find(r => r.id === 'PREFS-' + u.id) || null;
  if (!PREFS) { PREFS = DEFAULT_PREFS(u.id); save(PREFS); }
  applyLook();
  migrateOld();
}
function logout() { USER = null; PREFS = null; ls.set('lm_session', null); applyLook(); }
function restoreSession() {
  const s = ls.get('lm_session', null);
  const u = s && byId(s.userId);
  if (u && u.details.active !== false) { startSession(u); return true; }
  return false;
}

/* ---------- look & feel ---------- */
function applyLook() {
  const d = PREFS?.details || { theme: 'grape', mode: 'auto', font: 'm' };
  const t = THEMES[d.theme] || THEMES.grape;
  const root = document.documentElement;
  root.style.setProperty('--a', t.a); root.style.setProperty('--b', t.b);
  root.style.fontSize = (FONT_SIZES[d.font] || FONT_SIZES.m).px + 'px';
  const dark = d.mode === 'dark' || (d.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.mode = dark ? 'dark' : 'light';
  $('meta[name=theme-color]')?.setAttribute('content', t.a);
}

/* ---------- upgrade data from earlier versions ---------- */
function migrateOld() {
  if (!isAdmin()) return;
  const fix = [];
  for (const r of R) {
    if (['user', 'settings', 'prefs'].includes(r.type)) continue;
    let ch = false;
    if (!r.owner) { r.owner = USER.id; ch = true; }
    if (!r.scope) { r.scope = r.details?.book === 'family' ? 'family' : 'personal'; ch = true; }
    if (r.type === 'group' && Array.isArray(r.details.members) && typeof r.details.members[0] === 'string') {
      const map = {};
      r.details.members = r.details.members.map(n => { const m = { id: uid('mem'), name: n === 'Me' ? USER.title : n, userId: n === 'Me' ? USER.id : null }; map[n] = m.id; return m; });
      r.details.kind = r.details.kind || 'friends';
      R.filter(x => x.groupId === r.id).forEach(x => {
        const d = x.details;
        if (x.type === 'expense') { d.payers = [{ m: map[d.paidBy], amount: x.amount }]; d.splits = (d.splits || []).map(s => ({ m: map[s.person], share: s.share, units: 1 })); d.splitMethod = d.splitMethod === 'percent' ? 'percent' : d.splitMethod === 'exact' ? 'exact' : 'equal'; }
        if (x.type === 'settlement') { d.from = map[d.from] || d.from; d.to = map[d.to] || d.to; }
        x.updatedAt = new Date().toISOString(); fix.push(x);
      });
      ch = true;
    }
    if (ch) fix.push(r);
  }
  if (fix.length) Promise.all([...new Set(fix)].map(save)).then(() => typeof render === 'function' && render());
}

/* ================= GitHub sync ================= */
const GH_API = 'https:' + '//api.github.com';
const DATA_PATH = 'data/records.json';
const ROBOT_WORKFLOW = 'lifemanager-bot.yml';
let CONN = ls.get('lm_gh', null);    /* { repo, token, branch, sha, prevSha, lastSync } */
let syncTimer = null, syncing = false, syncState = CONN ? 'Not synced yet' : 'Not connected';

function outboxAdd(ids) { if (!CONN) return; const o = ls.get('lm_outbox', {}); ids.forEach(id => o[id] = Date.now() + Math.random()); ls.set('lm_outbox', o); scheduleSync(); }
function deletedAdd(ids) {
  if (!CONN) return;
  ls.set('lm_deleted', [...new Set(ls.get('lm_deleted', []).concat(ids))]);
  const o = ls.get('lm_outbox', {}); ids.forEach(id => delete o[id]); ls.set('lm_outbox', o);
  scheduleSync();
}
function scheduleSync(ms = 1500) { if (!CONN) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(true), ms); }
function ghMessage(status, j) {
  if (status === 401) return 'GitHub token is wrong or has expired. Create a new token and reconnect.';
  if (status === 403) return 'The GitHub token lacks permission (Contents / Actions / Workflows must be "Read and write"), or GitHub is limiting requests - try again in a minute.';
  if (status === 404) return 'Not found on GitHub. Check the repository name (username/repository) and that the token has access to it.';
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
    if (!content && j.size > 0) content = (await gh(`/repos/${conn.repo}/git/blobs/${j.sha}`, {}, conn)).content;
    return { text: b64dec(content), sha: j.sha };
  } catch (e) { if (e.status === 404) return { text: null, sha: null }; throw e; }
}
async function putFile(path, text, sha, message, conn = CONN) {
  const body = { message, content: b64enc(text), branch: conn.branch };
  if (sha) body.sha = sha;
  return (await gh(`/repos/${conn.repo}/contents/${path}`, { method: 'PUT', body }, conn)).content.sha;
}
async function readRemote(conn = CONN) {
  const f = await getFile(DATA_PATH, conn);
  if (!f.text) return { records: [], sha: f.sha };
  const data = JSON.parse(f.text);
  return { records: Array.isArray(data) ? data : (data.records || []), sha: f.sha };
}
const dataFileText = list => JSON.stringify({ app: 'lifemanager', version: APP_VERSION, savedAt: new Date().toISOString(), records: list }, null, 1);
const writeRemote = (list, sha, message = 'LifeManager: update data') => putFile(DATA_PATH, dataFileText(list), sha, message);

function afterDataReplaced() {
  SET = R.find(r => r.id === 'SETTINGS') || SET;
  if (USER) {
    const u = byId(USER.id);
    if (!u || u.details.active === false) { logout(); if (typeof render === 'function') render(); return; }
    USER = u; PREFS = byId('PREFS-' + u.id) || PREFS; applyLook();
  }
}
async function syncNow(silent = true) {
  if (!CONN) return;
  if (syncing) { scheduleSync(2500); return; }
  if (!navigator.onLine) { syncState = 'Offline - will sync later'; updateSyncDot(); return; }
  syncing = true; syncState = 'Syncing…'; updateSyncDot();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ob = ls.get('lm_outbox', {}), dels = ls.get('lm_deleted', []);
      const remote = await readRemote();
      if (remote.sha && remote.sha === CONN.prevSha && CONN.sha && !Object.keys(ob).length && !dels.length) break; /* stale read */
      const map = new Map(remote.records.map(x => [x.id, x]));
      let push = false;
      dels.forEach(id => { if (map.delete(id)) push = true; });
      Object.keys(ob).forEach(id => {
        const loc = byId(id); if (!loc) return;
        const ex = map.get(id);
        if (!ex || !ex.updatedAt || !loc.updatedAt || ex.updatedAt <= loc.updatedAt) { if (!ex || JSON.stringify(ex) !== JSON.stringify(loc)) push = true; map.set(id, loc); }
      });
      if (!map.has('SETTINGS') && SET) { map.set('SETTINGS', SET); push = true; }
      let list = [...map.values()], sha = remote.sha;
      if (push) {
        try { sha = await writeRemote(list, remote.sha); }
        catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 3) continue; throw e; }
      }
      const ob2 = ls.get('lm_outbox', {});
      Object.keys(ob).forEach(id => { if (ob2[id] === ob[id]) delete ob2[id]; });
      ls.set('lm_outbox', ob2);
      ls.set('lm_deleted', ls.get('lm_deleted', []).filter(x => !dels.includes(x)));
      const changed = push || remote.sha !== CONN.sha;
      if (changed) {
        const lm = new Map(list.map(x => [x.id, x]));
        Object.keys(ob2).forEach(id => { const loc = byId(id); if (loc) lm.set(id, loc); });
        list = [...lm.values()];
        await DB.replaceAll(list);
        R = list; afterDataReplaced();
      }
      if (push) CONN.prevSha = remote.sha;
      CONN.sha = sha; CONN.lastSync = new Date().toISOString(); ls.set('lm_gh', CONN);
      syncState = 'Synced ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      if (changed && typeof onRemoteChange === 'function') onRemoteChange();
      break;
    }
  } catch (e) {
    syncState = 'Sync problem: ' + e.message;
    if (!silent) alert(syncState);
  } finally { syncing = false; updateSyncDot(); }
}
function updateSyncDot() {
  const d = $('#sync-dot'); if (!d) return;
  d.className = 'sync-dot ' + (!CONN ? 'off' : syncing ? 'busy' : syncState.startsWith('Sync problem') ? 'err' : syncState.startsWith('Offline') ? 'off' : 'ok');
  d.title = syncState;
  const s = $('#sync-state'); if (s) s.textContent = syncState;
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
    if (!quiet) alert('Could not install the email robot: ' + e.message + '\n\nThe token needs "Workflows: Read and write" permission.');
    return false;
  }
}
const runRobot = mode => gh(`/repos/${CONN.repo}/actions/workflows/${ROBOT_WORKFLOW}/dispatches`, { method: 'POST', body: { ref: CONN.branch, inputs: { mode } } });

async function connectGitHub(repo, token) {
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository must look like  your-username/lifemanager-data');
  const conn = { repo, token: String(token || '').trim(), branch: 'main', sha: null, prevSha: null, lastSync: null };
  if (!conn.token) throw new Error('Enter the GitHub token.');
  const info = await gh(`/repos/${repo}`, {}, conn);
  conn.branch = info.default_branch || 'main';
  if (!info.private && !confirm('WARNING: this repository is PUBLIC - anyone could read your family data.\n\nMake it private on GitHub (Settings > General > Danger Zone > Change visibility).\n\nContinue anyway?')) throw new Error('Make the data repository private, then connect again.');
  const remote = await readRemote(conn);
  const server = new Map(remote.records.map(x => [x.id, x]));
  CONN = conn; ls.set('lm_gh', CONN); ls.set('lm_deleted', []); ls.set('lm_outbox', {});
  /* upload this phone's records that GitHub doesn't have (GitHub wins for settings/users) */
  const push = R.filter(x => !server.has(x.id) && !(x.id === 'SETTINGS' && server.has('SETTINGS'))).map(x => x.id);
  outboxAdd(push); clearTimeout(syncTimer);
  await syncNow(false);
  installRobot(CONN, true);
}
function disconnectGitHub() { CONN = null; ls.set('lm_gh', null); ls.set('lm_outbox', {}); ls.set('lm_deleted', []); syncState = 'Not connected'; }
function setupLink() {
  const code = btoa(JSON.stringify({ r: CONN.repo, t: CONN.token }));
  return location.origin + location.pathname + '#setup=' + encodeURIComponent(code);
}
function readSetupHash() {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname);
  try { const j = JSON.parse(atob(decodeURIComponent(m[1]))); return j.r && j.t ? j : null; } catch (e) { return null; }
}
