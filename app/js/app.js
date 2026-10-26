/* LifeManager Pro — navigation, actions, start-up */
'use strict';

let NAV = { view: 'home', id: null }; const STACK = [];
let LOCAL_ONLY = ls.get('lm_local_only', false);
const route = () => NAV;
function go(h, tab) {
  const [view, id] = String(h).split('/');
  if (tab) STACK.length = 0; else STACK.push(NAV);
  NAV = { view, id: id || null }; closeSheet(); render();
}
function goBack() { NAV = STACK.pop() || { view: 'home', id: null }; closeSheet(); render(); }

const VIEWS = { home: homeView, money: moneyView, split: splitView, group: groupView, plan: planView, bill: billView, card: cardView, scheme: schemeView, goal: goalView,
  tasks: tasksView, project: projectView, analytics: analyticsView, menu: menuView, users: usersView, settings: settingsView };
const NAV_OF = { group: 'split', bill: 'plan', card: 'plan', scheme: 'plan', goal: 'plan', project: 'tasks', analytics: '', menu: '', users: '', settings: '' };

function render() {
  const v = $('#view');
  if (!CONN && !LOCAL_ONLY && !users().length) { v.innerHTML = welcomeView(); return; }
  if (!users(true).length) { v.innerHTML = createAdminView(); return; }
  if (!USER) { v.innerHTML = loginView(); return; }
  document.body.classList.remove('no-nav');
  const fn = VIEWS[NAV.view] || homeView;
  nav(NAV.view in NAV_OF ? NAV_OF[NAV.view] : NAV.view);
  v.innerHTML = fn(NAV.id);
  window.scrollTo(0, 0);
}
function onRemoteChange() {
  if (!USER) { render(); return; }
  if ($('#sheet').innerHTML || document.activeElement?.matches?.('input,textarea,select')) return;
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------- actions ---------- */
const ACTIONS = {
  nav: el => go(el.dataset.to),
  tab: el => go(el.dataset.to, true),
  back: goBack,
  close: closeSheet,
  sync: async () => { if (!CONN) return toast('Not connected to GitHub'); toast('Syncing…'); await syncNow(false); render(); },
  'sync-login': async () => { await syncNow(false); render(); },
  'local-only': () => { if (!confirm('Use LifeManager only on this phone? Data will not sync to family phones until you connect GitHub in Settings.')) return; LOCAL_ONLY = true; ls.set('lm_local_only', true); render(); },
  'pick-user': el => { const f = $('#login-form'); f.username.value = el.dataset.u; f.password.focus(); },
  logout: () => { if (confirm('Sign out?')) { logout(); NAV = { view: 'home', id: null }; render(); } },

  'add-txn': el => txnForm(null, 'expense', { cardId: el.dataset.card }),
  'add-income': () => txnForm(null, 'income'),
  'edit-txn': el => txnForm(byId(el.dataset.id)),
  'money-tab': el => { ui.money.tab = el.dataset.v; render(); },
  'money-view': el => { ui.money.view = el.dataset.v; render(); },
  'money-month': el => { ui.money.month = shiftMonth(ui.money.month, +el.dataset.v); render(); },
  'budget-view': el => { ui.budget.view = el.dataset.v; render(); },
  'budget-month': el => { ui.budget.month = shiftMonth(ui.budget.month, +el.dataset.v); render(); },
  'stmt-view': el => { ui.stmt.view = el.dataset.v; render(); },
  'go-budget': el => { ui.money.tab = 'budget'; ui.budget.view = el.dataset.v || 'personal'; go('money', true); },
  'go-stmt': () => { ui.money.tab = 'stmt'; go('money', true); },
  'go-plan': el => { ui.plan.tab = el.dataset.v || el.dataset.to; go('plan', true); },
  'go-tasks': el => { ui.tasks.tab = el.dataset.v; go('tasks', true); },
  'edit-budget': el => budgetForm(el.dataset.v),
  'edit-opening': el => openingForm(el.dataset.v),
  csv: () => exportCSV(),

  'split-kind': el => { ui.split.kind = el.dataset.v; render(); },
  'add-group': () => groupForm(),
  'edit-group': el => groupForm(byId(el.dataset.id)),
  'add-gexp': el => groupExpenseForm(el.dataset.id),
  'add-gexp-any': () => pickGroup(),
  'edit-gexp': el => { const r = byId(el.dataset.id); groupExpenseForm(r.groupId, r); },
  'add-settle': el => settleForm(el.dataset.id, null, { from: el.dataset.from, to: el.dataset.to, a: el.dataset.a }),
  'edit-settle': el => { const r = byId(el.dataset.id); settleForm(r.groupId, r); },
  nudge: el => {
    const g = byId(el.dataset.id), name = memberName(g, el.dataset.p);
    const text = `Hi ${name}, a gentle reminder: ${money(Number(el.dataset.a))} is pending for "${g.title}". Thanks! 🙏`;
    window.open('https:' + '//wa.me/?text=' + encodeURIComponent(text), '_blank');
  },

  'plan-tab': el => { ui.plan.tab = el.dataset.v; render(); },
  'add-bill': () => billForm(),
  'edit-bill': el => billForm(byId(el.dataset.id)),
  'pay-bill': el => payBillForm(byId(el.dataset.id)),
  'skip-bill': async el => { const r = byId(el.dataset.id); if (!confirm(`Skip the payment due ${fmtDate(r.date)}?`)) return; advanceBill(r); await save(r); render(); toast('Skipped · next due ' + fmtDate(r.date)); },
  'add-card': () => cardForm(),
  'edit-card': el => cardForm(byId(el.dataset.id)),
  'pay-card': el => payCardForm(byId(el.dataset.id)),
  'edit-cardpay': el => { const p = byId(el.dataset.id); payCardForm(byId(p.parentId), p); },
  'add-scheme': () => schemeForm(),
  'edit-scheme': el => schemeForm(byId(el.dataset.id)),
  'pay-inst': el => instForm(byId(el.dataset.id), null, 'out'),
  'receive-inst': el => instForm(byId(el.dataset.id), null, 'in'),
  'edit-inst': el => { const x = byId(el.dataset.id); instForm(byId(x.parentId), x); },
  'add-goal': () => goalForm(),
  'edit-goal': el => goalForm(byId(el.dataset.id)),
  'goal-save': el => goalSaveForm(byId(el.dataset.id)),
  'edit-goalsave': el => { const x = byId(el.dataset.id); goalSaveForm(byId(x.parentId), x); },
  'goal-bought': el => goalBoughtForm(byId(el.dataset.id)),

  'tasks-tab': el => { ui.tasks.tab = el.dataset.v; render(); },
  'task-filter': el => { ui.tasks.filter = el.dataset.v; render(); },
  'add-task': el => taskForm(el.dataset.id || null),
  'edit-task': el => { const k = byId(el.dataset.id); taskForm(k.parentId, k); },
  'toggle-task': async el => { const k = byId(el.dataset.id); k.status = k.status === 'done' ? 'todo' : 'done'; await save(k); render(); if (k.status === 'done') toast('Nice work! ✅'); },
  'add-proj': () => projectForm(),
  'edit-proj': el => projectForm(byId(el.dataset.id)),
  'add-rem': () => reminderForm(),
  'edit-rem': el => reminderForm(byId(el.dataset.id)),
  'done-rem': async el => {
    const r = byId(el.dataset.id);
    if (r.status === 'completed') { r.status = 'pending'; await save(r); render(); return; }
    if (r.details.repeat && r.details.repeat !== 'none') {
      let n = nextRemDate(r.date, r.details.repeat, r.details.anchorDay); while (n < today()) n = nextRemDate(n, r.details.repeat, r.details.anchorDay);
      r.date = n; toast('Done · next on ' + fmtDate(n));
    } else { r.status = 'completed'; toast('Done ✅'); }
    await save(r); render();
  },
  perm: async () => { if (!('Notification' in window)) return alert('This browser does not support notifications. On iPhone, add the app to the Home Screen first.'); await Notification.requestPermission(); render(); },

  'stats-view': el => { ui.stats.view = el.dataset.v; render(); },
  'stats-month': el => { ui.stats.month = shiftMonth(ui.stats.month, +el.dataset.v); render(); },

  'add-user': () => userForm(),
  'edit-user': el => userForm(byId(el.dataset.id)),
  'share-setup': () => { const t = `Join our family LifeManager app 👪\nOpen this link on your phone, then sign in with the username and password I gave you:\n${setupLink()}`; window.open('https:' + '//wa.me/?text=' + encodeURIComponent(t), '_blank'); },
  'copy-setup': async () => { try { await navigator.clipboard.writeText(setupLink()); toast('Setup link copied'); } catch (e) { prompt('Copy this link:', setupLink()); } },
  'set-theme': async el => { PREFS.details.theme = el.dataset.v; applyLook(); await save(PREFS); render(); },
  'set-mode': async el => { PREFS.details.mode = el.dataset.v; applyLook(); await save(PREFS); render(); },
  'set-font': async el => { PREFS.details.font = el.dataset.v; applyLook(); await save(PREFS); render(); },
  'edit-profile': () => profileForm(),
  'change-pass': () => passwordForm(),
  connect: () => connectForm(),
  'install-robot': async () => { toast('Installing robot…'); if (await installRobot(CONN)) toast('Email robot installed / up to date'); },
  'test-email': async () => {
    if (!USER.details.email) return alert('Add your email first: Settings › Edit name & email.');
    try { await syncNow(true); await runRobot('test'); toast('Test email on its way (1-2 minutes)'); }
    catch (e) { alert('Could not start the email robot: ' + e.message + '\n\nAsk the admin to tap "Install / update robot", and check the Gmail secrets are added.'); }
  },
  'robot-backup': async () => { try { await runRobot('backup'); toast('Backup started — saved in the backups folder on GitHub'); } catch (e) { alert(e.message); } },
  backup: () => {
    const data = { app: 'lifemanager', version: APP_VERSION, exportedAt: new Date().toISOString(), exportedBy: USER.details.username, records: isAdmin() ? R.filter(r => canSee(r) || ['user', 'settings'].includes(r.type)) : R.filter(canSee) };
    download(`lifemanager-backup-${today()}.json`, JSON.stringify(data, null, 1), 'application/json'); toast('Backup downloaded');
  },
  import: () => $('#import-file').click(),
  wipe: async () => {
    if (prompt('Type DELETE to erase ALL data for everyone (GitHub keeps history). Export a backup first!') !== 'DELETE') return;
    const keep = R.filter(r => ['user', 'settings', 'prefs'].includes(r.type));
    if (CONN) { try { const rem = await readRemote(); await writeRemote(keep, rem.sha, 'LifeManager: delete all data'); CONN.sha = null; } catch (e) { return alert(e.message); } }
    await DB.replaceAll(keep); R = keep; ls.set('lm_outbox', {}); ls.set('lm_deleted', []); render(); toast('All data deleted');
  }
};

/* ---------- import / export ---------- */
async function importBackup(file) {
  let data; try { data = JSON.parse(await file.text()); } catch (e) { return alert('This file is not a valid backup.'); }
  const recs = Array.isArray(data) ? data : data.records;
  if (!Array.isArray(recs) || !recs.every(r => r && typeof r.id === 'string' && typeof r.type === 'string')) return alert('This file is not a LifeManager backup.');
  if (!confirm(`Import ${recs.length} records? Existing records with the same ID are replaced; others are kept.`)) return;
  const keepUsers = new Set(R.filter(r => r.type === 'user').map(r => r.id));
  const now = new Date().toISOString();
  const list = recs.filter(r => !(r.type === 'user' && !keepUsers.has(r.id) && R.some(u => u.type === 'user' && u.details.username === r.details?.username)))
    .map(r => ({ ...r, updatedAt: now, owner: r.owner || USER.id, scope: r.scope || (r.details?.book === 'family' ? 'family' : 'personal') }));
  await DB.putMany(list);
  list.forEach(r => { const i = R.findIndex(x => x.id === r.id); if (i >= 0) R[i] = r; else R.push(r); });
  afterDataReplaced(); migrateOld(); outboxAdd(list.map(r => r.id));
  render(); toast(`Imported ${list.length} records`);
}
function exportCSV() {
  const st = ui.money, rows = txns(st.view, r => r.date?.startsWith(st.month)).sort((a, b) => a.date.localeCompare(b.date));
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const head = ['Date', 'Type', 'Description', 'Category', 'Account', 'Paid by', 'Amount', 'Payment', 'Notes'];
  const lines = rows.map(r => [r.date, r.type, r.title, r.category, scopeLabel(r.scope), userName(r.details.paidBy || r.owner), (r.type === 'income' ? 1 : -1) * r.amount / 100, r.details.cardId ? byId(r.details.cardId)?.title : r.details.mode, r.details.notes].map(q).join(','));
  download(`lifemanager-${st.view}-${st.month}.csv`, '﻿' + [head.join(','), ...lines].join('\r\n'), 'text/csv');
}

/* ---------- phone notifications (while the app is open) ---------- */
async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png' }); new Notification(title, { body, tag }); } catch (e) { /* ignore */ }
}
function checkAlerts() {
  if (!USER) return;
  const seen = ls.get('lm_notified', {}), now = Date.now();
  for (const r of V('reminder', r => r.status === 'pending' && (r.details.forUser || r.owner) === USER.id)) {
    const key = r.id + r.date + r.details.time, at = remAt(r).getTime() - (Number(r.details.before) || 0) * 60000;
    if (now >= at && now - at < 864e5 && !seen[key]) { seen[key] = 1; notify(r.title, `${fmtDate(r.date)} ${fmtTime(r.details.time)}${r.amount ? ' · ' + money(r.amount) : ''}`, r.id); }
  }
  for (const x of upcoming(1)) { const key = x.kind + x.ref.id + x.date; if (!seen[key] && x.date <= today()) { seen[key] = 1; notify(`${x.title} ${dueText(x.date).toLowerCase()}`, x.amount ? money(x.amount) : 'Open LifeManager to pay', key); } }
  ls.set('lm_notified', seen);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACTIONS[el.dataset.act]) return;
  if (el.closest('#sheet form') && el.dataset.act !== 'close') return;
  e.preventDefault(); e.stopPropagation();
  Promise.resolve(ACTIONS[el.dataset.act](el)).catch(err => { console.error(err); alert(err.message || err); });
});
document.addEventListener('submit', async e => {
  const f = e.target, fd = new FormData(f);
  const btn = f.querySelector('button.btn:not([type=button])');
  const busy = (on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; if (label) btn.innerHTML = label; }
    else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }
  };
  try {
    if (f.id === 'connect-form') { e.preventDefault(); busy(true, 'Connecting…'); await connectGitHub(fd.get('repo'), fd.get('token')); render(); toast('Connected'); }
    else if (f.id === 'admin-form') {
      e.preventDefault();
      if (fd.get('password') !== fd.get('password2')) throw new Error('Passwords do not match.');
      busy(true, 'Creating…');
      if (CONN) await syncNow(true);
      if (users(true).length) { render(); throw new Error('An admin already exists for this family. Please sign in.'); }
      if (!SET) SET = R.find(r => r.id === 'SETTINGS') || DEFAULT_SETTINGS();
      if (fd.get('family')) SET.details.familyName = fd.get('family').trim();
      const u = await createUser({ name: fd.get('name'), username: fd.get('username'), password: fd.get('password'), role: 'admin', email: fd.get('email') });
      await save(SET);
      startSession(u); render(); toast('Welcome, ' + u.title + '! 🎉');
    }
    else if (f.id === 'login-form') { e.preventDefault(); busy(true, 'Signing in…'); await login(fd.get('username'), fd.get('password')); NAV = { view: 'home', id: null }; render(); }
    else if (f.id === 'household-form') {
      e.preventDefault();
      const list = k => [...new Set(fd.get(k).split(',').map(s => s.trim()).filter(Boolean))];
      const ec = list('expenseCategories'), ic = list('incomeCategories'), pm = list('paymentModes');
      if (!ec.length || !ic.length || !pm.length) throw new Error('Categories and payment modes cannot be empty.');
      Object.assign(SET.details, { familyName: fd.get('familyName').trim(), currency: fd.get('currency').trim() || '₹', expenseCategories: ec, incomeCategories: ic, paymentModes: pm });
      await save(SET); toast('Household saved'); render();
    }
  } catch (err) { alert(err.message || err); busy(false); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'money-search') { ui.money.q = e.target.value; clearTimeout(ACTIONS._s); ACTIONS._s = setTimeout(() => { const pos = e.target.selectionStart; render(); const i = $('#money-search'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 250); }
});
document.addEventListener('change', e => { if (e.target.id === 'import-file' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyLook);

/* ---------- start ---------- */
(async function init() {
  try {
    R = await DB.all();
    SET = R.find(r => r.id === 'SETTINGS') || null;
    if (!SET) { SET = DEFAULT_SETTINGS(); await DB.put(SET); R.push(SET); }
    applyLook();
    const setup = readSetupHash();
    if (setup) {
      $('#view').innerHTML = authShell('<h1>Setting up…</h1><p class="lead">Connecting this phone to your family data.</p>');
      try { await connectGitHub(setup.r, setup.t); toast('Phone connected — now sign in'); } catch (e) { alert('Setup link did not work: ' + e.message); }
    }
    restoreSession();
    render();
    if (CONN) syncNow(true).then(() => { if (!USER) render(); });
    navigator.storage?.persist?.();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    setInterval(() => { if (!document.hidden) syncNow(true); }, 30000);
    setInterval(checkAlerts, 60000); setTimeout(checkAlerts, 3000);
    window.addEventListener('online', () => syncNow(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncNow(true); checkAlerts(); } });
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `<div class="card empty" style="margin:20vh 1rem">Could not start: ${esc(err.message)}<br>Private/incognito mode can block storage.</div>`;
  }
})();
