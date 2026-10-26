/* LifeManager Pro — screens */
'use strict';

const ui = {
  money: { tab: 'txns', view: 'all', month: curMonth(), q: '' },
  split: { kind: 'all' },
  plan: { tab: 'bills' },
  tasks: { tab: 'tasks', filter: 'mine' },
  stats: { view: 'all', month: curMonth() },
  budget: { view: 'personal', month: curMonth() },
  stmt: { view: 'personal' }
};
const scopeLabel = s => s === 'family' ? 'Family' : 'Personal';
const userAv = (u, size = '') => u ? `<span class="av ${size}" style="background:${u.details.color || colorFor(u.title)}">${esc(initials(u.title))}</span>` : '';
const icoCat = (c, big) => `<div class="ico soft" style="background:${colorFor(c || 'x')}22">${catIcon(c)}</div>`;
const emptyBox = (emo, text, btn) => `<div class="card empty"><span class="emo">${emo}</span>${text}${btn ? `<div style="margin-top:.9rem">${btn}</div>` : ''}</div>`;
const barClass = p => p >= 100 ? 'over' : p >= 80 ? 'warn' : 'ok';

function header(title, kicker, back) {
  const u = USER;
  $('#top').innerHTML = `<div class="in">
    ${back ? `<button class="icon-btn" data-act="back" aria-label="Back">${I.back}</button>` : ''}
    <div class="t">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<h1>${esc(title)}</h1></div>
    <button class="icon-btn" data-act="nav" data-to="analytics" aria-label="Analytics">${I.chart}</button>
    <button class="icon-btn" data-act="sync" aria-label="Sync">${I.sync}<span id="sync-dot" class="sync-dot"></span></button>
    ${u ? `<button class="avatar-btn" style="background:${u.details.color || colorFor(u.title)}" data-act="nav" data-to="menu" aria-label="Menu">${esc(initials(u.title))}</button>` : ''}
  </div>`;
  updateSyncDot();
}
function nav(active) {
  const tabs = [['home', 'Home', I.home], ['money', 'Money', I.wallet], ['split', 'Split', I.split], ['plan', 'Plan', I.plan], ['tasks', 'Tasks', I.tasks]];
  $('#nav').innerHTML = `<div class="in">${tabs.map(([k, l, ic]) => `<button data-act="tab" data-to="${k}" class="${active === k ? 'on' : ''}"><span class="pill">${ic}</span>${l}</button>`).join('')}</div>`;
}
const fab = (act, label, extra = '') => `<button class="fab" data-act="${act}" ${extra} aria-label="${esc(label)}">${I.plus}</button>`;
const seg = (act, cur, items, cls = '') => `<div class="seg ${cls}">${items.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
const monthNav = (act, m) => `<div class="monthnav"><button class="icon-btn" data-act="${act}" data-v="-1" aria-label="Previous month">${I.left}</button><b>${fmtMonth(m)}</b><button class="icon-btn" data-act="${act}" data-v="1" aria-label="Next month" ${m >= curMonth() ? 'disabled style="opacity:.35"' : ''}>${I.right}</button></div>`;

/* ================= AUTH ================= */
function authShell(inner) {
  $('#top').innerHTML = ''; $('#nav').innerHTML = ''; document.body.classList.add('no-nav');
  return `<div class="auth-bg"></div><div class="auth"><div class="logo">${I.wallet}</div>${inner}</div>`;
}
function welcomeView() {
  return authShell(`<h1>LifeManager</h1><p class="lead">Money, family, friends &amp; plans — in one place.</p>
    <div class="card">
      <h2 style="margin-bottom:.4rem">Connect your data</h2>
      <p class="muted small" style="margin:0 0 1rem">Enter your private GitHub data repository and token. Family members can instead open the <b>setup link</b> the admin shares.</p>
      <form id="connect-form">
        <label class="field"><span>Data repository</span><input name="repo" placeholder="username/lifemanager-data" autocapitalize="none" autocomplete="off" value="${esc(CONN?.repo || '')}"></label>
        <label class="field"><span>GitHub token</span><input name="token" type="password" placeholder="github_pat_…" autocomplete="off"></label>
        <button class="btn block">Connect</button>
      </form>
      <button class="btn plain block" data-act="local-only" style="margin-top:.6rem">Use on this phone only (no sync)</button>
    </div>`);
}
function createAdminView() {
  return authShell(`<h1>Create admin</h1><p class="lead">You're the first person here — set up the admin login.</p>
    <div class="card"><form id="admin-form">
      <label class="field"><span>Your name</span><input name="name" placeholder="e.g. Vijay" required></label>
      <label class="field"><span>Username</span><input name="username" placeholder="e.g. vijay" autocapitalize="none" required></label>
      <label class="field"><span>Email (for reminders)</span><input name="email" type="email" placeholder="you@gmail.com"></label>
      <div class="row2"><label class="field"><span>Password</span><input name="password" type="password" required></label>
      <label class="field"><span>Repeat password</span><input name="password2" type="password" required></label></div>
      <label class="field"><span>Family name</span><input name="family" placeholder="e.g. Muddur family"></label>
      <button class="btn block">Create admin &amp; sign in</button>
    </form></div>`);
}
function loginView() {
  const us = users();
  return authShell(`<h1>Welcome back</h1><p class="lead">${esc(SET?.details.familyName || 'LifeManager')}</p>
    <div class="card"><form id="login-form">
      ${us.length && us.length <= 6 ? `<div class="member-chips" style="margin:0 0 1rem;justify-content:center">${us.map(u => `<button type="button" class="chip grey" data-act="pick-user" data-u="${esc(u.details.username)}" style="padding:.35rem .7rem;font-size:.85rem;border:0;cursor:pointer">${esc(u.title)}</button>`).join('')}</div>` : ''}
      <label class="field"><span>Username</span><input name="username" autocapitalize="none" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn block">${I.lock} Sign in</button>
    </form>
    <p class="muted tiny" style="text-align:center;margin:1rem 0 0">Forgot your password? Ask the admin to reset it.</p></div>
    ${CONN ? `<p class="muted tiny" style="text-align:center;margin-top:1rem">${esc(syncState)} · <button class="link" data-act="sync-login">Sync now</button></p>` : ''}`);
}

/* ================= HOME ================= */
function homeView() {
  const h = new Date().getHours();
  header(`${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${USER.title.split(' ')[0]}`, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }));
  const m = curMonth(), bs = budgetStatus(m, 'personal'), tAll = monthTotals(m, 'all');
  const { recv, pay } = myDues();
  const up = upcoming(10);
  const td = today();
  const rems = V('reminder', r => r.status === 'pending' && r.date <= addDays(td, 2)).sort((a, b) => remAt(a) - remAt(b)).slice(0, 4);
  const tasks = V('task', k => k.status !== 'done' && (k.details.assignee || k.owner) === USER.id).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).slice(0, 5);
  const recent = txns('all').sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 5);
  const alerts = [];
  if (bs.total && bs.pct >= 80) alerts.push(`<div class="banner ${bs.pct >= 100 ? 'exp' : ''}">⚠️ ${bs.pct >= 100 ? 'You are over' : `${bs.pct}% used of`} your personal budget this month.<button class="btn sm ghost" data-act="go-budget">View</button></div>`);
  const fb = budgetStatus(m, 'family');
  if (fb.total && fb.pct >= 80) alerts.push(`<div class="banner ${fb.pct >= 100 ? 'exp' : ''}">🏠 Family budget ${fb.pct >= 100 ? 'exceeded' : `${fb.pct}% used`}.<button class="btn sm ghost" data-act="go-budget" data-v="family">View</button></div>`);
  const od = up.filter(x => x.date < td);
  if (od.length) alerts.push(`<div class="banner exp">⏰ ${od.length} payment${od.length > 1 ? 's' : ''} overdue.<button class="btn sm ghost" data-act="tab" data-to="plan">Open</button></div>`);
  if (!CONN && isAdmin()) alerts.push(`<div class="banner info">Data is only on this phone. Connect GitHub to sync with family.<button class="btn sm ghost" data-act="nav" data-to="settings">Connect</button></div>`);
  if (syncState.startsWith('Sync problem')) alerts.push(`<div class="banner exp">${esc(syncState)}<button class="btn sm ghost" data-act="sync">Retry</button></div>`);
  const goals = V('goal', g => g.details.status !== 'bought' && g.details.status !== 'dropped').slice(0, 3);
  return `
  <div class="hero">
    <div class="label">My spending · ${fmtMonth(m)}</div>
    <div class="big num" data-count="${bs.spent}">${money(bs.spent)}</div>
    <div class="sub">${bs.total ? `${bs.pct}% of ${money(bs.total)} budget · ${money(Math.max(0, bs.left))} left${bs.daysLeft ? ` · ${moneyShort(bs.perDay)}/day` : ''}` : 'Set a monthly budget in Money › Budget'}</div>
    ${bs.total ? `<div class="bar"><i style="width:${clamp(bs.pct, 0, 100)}%"></i></div>` : ''}
    <div class="hero-row"><div><small>Income</small><b>${moneyShort(tAll.income)}</b></div><div><small>Family spend</small><b>${moneyShort(fb.spent)}</b></div><div><small>Saved</small><b>${moneyShort(tAll.savings)}</b></div></div>
  </div>
  ${alerts.join('')}
  <div class="section quick">
    <button data-act="add-txn"><span class="qi" style="background:linear-gradient(135deg,#f43f5e,#fb7185)">${I.expense}</span>Expense</button>
    <button data-act="add-income"><span class="qi" style="background:linear-gradient(135deg,#10b981,#34d399)">${I.income}</span>Income</button>
    <button data-act="add-gexp-any"><span class="qi" style="background:linear-gradient(135deg,#3b82f6,#06b6d4)">${I.split}</span>Split bill</button>
    <button data-act="add-task"><span class="qi" style="background:linear-gradient(135deg,#8b5cf6,#d946ef)">${I.tasks}</span>Task</button>
  </div>
  <div class="grid2 section">
    <button class="card stat tint-inc" style="border:0;text-align:left;cursor:pointer" data-act="tab" data-to="split"><div class="label">🤝 To receive</div><div class="val pos num">${money(recv)}</div></button>
    <button class="card stat tint-exp" style="border:0;text-align:left;cursor:pointer" data-act="tab" data-to="split"><div class="label">💸 To pay</div><div class="val neg num">${money(pay)}</div></button>
  </div>
  <div class="section"><div class="section-h"><h2>Upcoming payments</h2><button class="link" data-act="tab" data-to="plan">Planner</button></div>
    ${up.length ? `<div class="list">${up.slice(0, 5).map(upItem).join('')}</div>` : emptyBox('🎉', 'Nothing due in the next 10 days.')}</div>
  <div class="section"><div class="section-h"><h2>My pending tasks</h2><button class="link" data-act="tab" data-to="tasks">All tasks</button></div>
    ${tasks.length ? `<div class="list">${tasks.map(k => taskItem(k, true)).join('')}</div>` : emptyBox('✅', 'No pending tasks.')}</div>
  ${rems.length ? `<div class="section"><div class="section-h"><h2>Reminders</h2><button class="link" data-act="go-tasks" data-v="reminders">View all</button></div><div class="list">${rems.map(remItem).join('')}</div></div>` : ''}
  ${goals.length ? `<div class="section"><div class="section-h"><h2>Big purchases</h2><button class="link" data-act="go-plan" data-v="goals">Goals</button></div><div class="list">${goals.map(goalItem).join('')}</div></div>` : ''}
  <div class="section"><div class="section-h"><h2>Recent</h2><button class="link" data-act="tab" data-to="money">All money</button></div>
    ${recent.length ? `<div class="list">${recent.map(txnItem).join('')}</div>` : emptyBox('💸', 'No transactions yet. Tap <b>Expense</b> to add one.')}</div>`;
}
function upItem(x) {
  const n = daysBetween(today(), x.date);
  const act = x.kind === 'bill' ? `data-act="pay-bill" data-id="${x.ref.id}"` : x.kind === 'card' ? `data-act="nav" data-to="card/${x.ref.id}"` : `data-act="nav" data-to="scheme/${x.ref.id}"`;
  return `<button class="item" ${act}><div class="ico soft" style="background:${n < 0 ? 'var(--soft-exp)' : n <= 2 ? 'var(--soft-sav)' : 'var(--soft-info)'}">${x.icon}</div>
    <div class="main"><div class="ttl">${esc(x.title)}</div><div class="sub ${n < 0 ? 'neg' : ''}">${esc(n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue · was due ${fmtDate(x.date)}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due ${fmtDateLong(x.date)}${n < 7 ? ` · in ${n} days` : ''}`)}</div></div>
    <div class="amt num">${x.amount ? money(x.amount) : '<span class="chip grey">Amount varies</span>'}</div></button>`;
}
function txnItem(r) {
  const fam = r.scope === 'family', inc = r.type === 'income';
  const card = r.details.cardId ? byId(r.details.cardId) : null;
  const sub = [r.category, fam ? `Family · ${userName(r.details.paidBy || r.owner)}` : 'Personal', card ? `💳 ${card.title}` : r.details.mode, fmtDate(r.date)].filter(Boolean).join(' · ');
  return `<button class="item" data-act="edit-txn" data-id="${r.id}">${icoCat(r.category)}
    <div class="main"><div class="ttl">${esc(r.title || r.category)}</div><div class="sub">${esc(sub)}</div></div>
    <div class="amt num ${inc ? 'pos' : ''}">${inc ? '+' : ''}${money(r.amount)}${r.details.recurringId ? '<small>🔁 recurring</small>' : ''}</div></button>`;
}

/* ================= MONEY ================= */
function moneyView() {
  header('Money', 'Income · spending · budget');
  const st = ui.money;
  return `${seg('money-tab', st.tab, [['txns', '💳 Transactions'], ['budget', '🎯 Budget'], ['stmt', '📄 Carry-forward']], 'grad')}
    ${st.tab === 'budget' ? budgetPanel() : st.tab === 'stmt' ? statementPanel() : txnPanel()}`;
}
function txnPanel() {
  const st = ui.money;
  let list = txns(st.view, r => r.date?.startsWith(st.month));
  const q = st.q.trim().toLowerCase();
  if (q) list = list.filter(r => [r.title, r.category, r.details.notes, r.details.mode].join(' ').toLowerCase().includes(q));
  const inc = sum(list.filter(r => r.type === 'income'), r => r.amount), exp = sum(list.filter(r => r.type === 'expense'), r => r.amount);
  list.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const days = groupBy(list, r => r.date);
  return `<div class="section">${seg('money-view', st.view, [['all', 'All'], ['personal', 'Personal'], ['family', 'Family']])}</div>
    ${monthNav('money-month', st.month)}
    <div class="grid3">
      <div class="card stat tint-inc"><div class="label">Income</div><div class="val pos num" style="font-size:1.05rem">${money(inc)}</div></div>
      <div class="card stat tint-exp"><div class="label">Spent</div><div class="val num" style="font-size:1.05rem">${money(exp)}</div></div>
      <div class="card stat tint-info"><div class="label">Balance</div><div class="val num ${inc - exp < 0 ? 'neg' : ''}" style="font-size:1.05rem">${money(inc - exp)}</div></div>
    </div>
    <div class="toolbar"><label class="search">${I.search}<input id="money-search" placeholder="Search title, category, notes…" value="${esc(st.q)}"></label>
      <button class="btn sm ghost" data-act="csv">CSV</button></div>
    ${Object.keys(days).length ? Object.entries(days).map(([d, rs]) => `<div class="day-h"><span>${esc(fmtDate(d))}</span><span>${money(sum(rs.filter(r => r.type === 'expense'), r => r.amount))}</span></div><div class="list">${rs.map(txnItem).join('')}</div>`).join('')
      : `<div class="section">${emptyBox('🗒️', q ? 'No matches.' : `No transactions in ${fmtMonth(st.month)}.`)}</div>`}
    ${fab('add-txn', 'Add transaction')}`;
}
function budgetPanel() {
  const st = ui.budget, b = budgetStatus(st.month, st.view);
  const canEdit = st.view === 'personal' || isAdmin();
  return `<div class="section">${seg('budget-view', st.view, [['personal', '👤 My budget'], ['family', '🏠 Family budget']])}</div>
    ${monthNav('budget-month', st.month)}
    <div class="card" style="display:flex;gap:1rem;align-items:center">
      ${ring(b.pct, 84, b.pct >= 100 ? 'var(--c-exp)' : b.pct >= 80 ? 'var(--c-sav)' : 'var(--c-inc)')}
      <div style="flex:1"><div class="muted small">Spent of ${b.total ? money(b.total) : 'no budget set'}</div>
        <div style="font-family:Outfit,sans-serif;font-size:1.6rem;font-weight:800">${money(b.spent)}</div>
        <div class="small ${b.left < 0 ? 'neg' : 'pos'}" style="font-weight:700">${b.total ? (b.left < 0 ? `Over by ${money(-b.left)}` : `${money(b.left)} left`) : ''}${b.total && b.daysLeft && b.left > 0 ? ` · ${money(Math.floor(b.perDay))}/day for ${b.daysLeft} days` : ''}</div></div>
    </div>
    <div class="card section"><div class="section-h" style="margin:0"><h2>By category</h2>${canEdit ? `<button class="link" data-act="edit-budget" data-v="${st.view}">Edit budget</button>` : ''}</div>
      ${b.cats.length ? b.cats.map(c => { const p = pct(c.spent, c.limit); return `<div class="hbar"><div class="hbar-top"><span>${catIcon(c.cat)} ${esc(c.cat)}</span><b class="num">${money(c.spent)}${c.limit ? ` <span class="muted small">/ ${moneyShort(c.limit)}</span>` : ''}</b></div>
        <div class="bar ${c.limit ? barClass(p) : ''}"><i style="width:${c.limit ? clamp(p, 2, 100) : clamp(pct(c.spent, b.spent || 1), 2, 100)}%"></i></div>${c.limit && p >= 100 ? `<div class="hbar-sub neg">Over by ${money(c.spent - c.limit)}</div>` : ''}</div>`; }).join('') : '<div class="empty small">No spending yet.</div>'}
    </div>
    ${!b.total && canEdit ? `<button class="btn block section" data-act="edit-budget" data-v="${st.view}">${I.target} Set ${st.view} budget</button>` : ''}`;
}
function statementPanel() {
  const st = ui.stmt, rows = statement(st.view);
  const last = rows[rows.length - 1];
  const canEdit = st.view === 'personal' || isAdmin();
  return `<div class="section">${seg('stmt-view', st.view, [['personal', '👤 Mine'], ['family', '🏠 Family']])}</div>
    <div class="card section" style="background:${last && last.close < 0 ? 'var(--soft-exp)' : 'var(--soft-inc)'}">
      <div class="muted small">Balance carried into next month</div>
      <div style="font-family:Outfit,sans-serif;font-size:2rem;font-weight:800" class="${last && last.close < 0 ? 'neg' : 'pos'}">${money(last?.close || 0)}</div>
      <div class="small">${last ? (last.net >= 0 ? `✅ This month: surplus ${money(last.net)}` : `⚠️ This month: shortage ${money(-last.net)}`) : ''}</div>
    </div>
    <div class="card section">${lineChart(rows.slice(-12).map(r => fmtMon(r.m)), [{ name: 'Closing balance', color: CH.a, values: rows.slice(-12).map(r => r.close), area: true }, { name: 'Monthly surplus/shortage', color: CH.sav, values: rows.slice(-12).map(r => r.net) }])}</div>
    <div class="card section scroll-x"><table class="table"><thead><tr><th>Month</th><th>Opening</th><th>In</th><th>Spent</th><th>Saved</th><th>Result</th><th>Closing</th></tr></thead><tbody>
      ${rows.slice().reverse().map(r => `<tr><td><b>${fmtMon(r.m)} ${r.m.slice(2, 4)}</b></td><td>${moneyShort(r.open)}</td><td class="pos">${moneyShort(r.income + r.savingsIn)}</td><td>${moneyShort(r.spend)}</td><td>${moneyShort(r.savings)}</td>
        <td><span class="chip ${r.net >= 0 ? 'inc' : 'exp'}">${r.net >= 0 ? 'Surplus' : 'Shortage'} ${moneyShort(Math.abs(r.net))}</span></td><td><b class="${r.close < 0 ? 'neg' : ''}">${moneyShort(r.close)}</b></td></tr>`).join('')}
    </tbody></table>
    <p class="muted tiny" style="margin:.8rem 0 0">Closing = opening + income + savings received − spending − money put into RD/chits/goals. Each month's closing becomes the next month's opening.</p></div>
    ${canEdit ? `<button class="btn ghost block section" data-act="edit-opening" data-v="${st.view}">Set opening balance &amp; start month</button>` : ''}`;
}
