/* LifeManager Pro — money maths: budgets, carry-forward, splits, cards, savings, payments */
'use strict';

/* ---------- transactions ---------- */
/* view: 'personal' (mine) | 'family' | 'all' (mine + family) */
function txns(view, f) {
  return R.filter(r => (r.type === 'expense' || r.type === 'income') && !r.groupId && canSee(r) &&
    (view === 'family' ? r.scope === 'family' : view === 'personal' ? (r.scope !== 'family' && r.owner === USER.id) : true) && (!f || f(r)));
}
function myMember(g) { return (g.details.members || []).find(m => m.userId === USER?.id); }
function myGroupShares(m) {
  const out = [];
  for (const g of V('group')) {
    const me = myMember(g); if (!me) continue;
    for (const e of R) if (e.groupId === g.id && e.type === 'expense' && (!m || e.date?.startsWith(m))) {
      const s = (e.details.splits || []).find(x => x.m === me.id);
      if (s && s.share) out.push({ e, g, share: s.share });
    }
  }
  return out;
}
function savingsFlows(view, m) {
  /* money moved into RD / chits / SIP / goals (out) and received back (in) */
  let out = 0, inn = 0;
  const match = p => p && canSee(p) && (view === 'family' ? p.scope === 'family' : view === 'personal' ? (p.scope !== 'family' && p.owner === USER.id) : true);
  for (const r of R) {
    if ((r.type !== 'installment' && r.type !== 'goalsave') || !r.date?.startsWith(m)) continue;
    if (!match(byId(r.parentId))) continue;
    if (r.details?.direction === 'in') inn += r.amount || 0; else out += r.amount || 0;
  }
  return { out, inn };
}
function monthTotals(m, view = 'all') {
  const t = { income: 0, expense: 0, groupShare: 0, savings: 0, savingsIn: 0, byCat: {} };
  for (const r of txns(view, r => r.date?.startsWith(m))) {
    if (r.type === 'income') t.income += r.amount;
    else { t.expense += r.amount; t.byCat[r.category || 'Other'] = (t.byCat[r.category || 'Other'] || 0) + r.amount; }
  }
  if (view !== 'family') for (const x of myGroupShares(m)) { t.groupShare += x.share; t.byCat['Group'] = (t.byCat['Group'] || 0) + x.share; }
  const sv = savingsFlows(view, m); t.savings = sv.out; t.savingsIn = sv.inn;
  t.spend = t.expense + t.groupShare;
  t.net = t.income + t.savingsIn - t.spend - t.savings;
  return t;
}

/* ---------- budgets ---------- */
function budgetFor(view) {
  if (view === 'family') return { total: SET.details.familyBudget || 0, cats: SET.details.familyCatBudgets || {} };
  return { total: PREFS.details.budget || 0, cats: PREFS.details.catBudgets || {} };
}
function budgetStatus(m, view) {
  const t = monthTotals(m, view), b = budgetFor(view);
  const spent = view === 'family' ? t.expense : t.spend;
  const [y, mo] = m.split('-').map(Number);
  const dim = new Date(y, mo, 0).getDate();
  const isCur = m === curMonth();
  const daysLeft = isCur ? dim - new Date().getDate() + 1 : (m > curMonth() ? dim : 0);
  const cats = Object.keys({ ...b.cats, ...t.byCat }).map(c => ({ cat: c, spent: t.byCat[c] || 0, limit: b.cats[c] || 0 }))
    .sort((a, c) => (c.limit ? c.spent / c.limit : 0) - (a.limit ? a.spent / a.limit : 0) || c.spent - a.spent);
  return { spent, total: b.total, left: b.total - spent, pct: pct(spent, b.total), daysLeft, perDay: daysLeft ? Math.max(0, b.total - spent) / daysLeft : 0, cats, t };
}

/* ---------- carry-forward statement ---------- */
function statement(view) {
  const cfg = view === 'family' ? { opening: SET.details.familyOpening || 0, start: SET.details.familyStartMonth } : { opening: PREFS.details.opening || 0, start: PREFS.details.startMonth };
  const firstTx = txns(view).map(r => r.date).filter(Boolean).sort()[0];
  let start = cfg.start || (firstTx ? firstTx.slice(0, 7) : curMonth());
  if (start > curMonth()) start = curMonth();
  const rows = []; let open = cfg.opening;
  for (let m = start; m <= curMonth() && rows.length < 120; m = shiftMonth(m, 1)) {
    const t = monthTotals(m, view);
    const spend = view === 'family' ? t.expense : t.spend;
    const inflow = t.income + t.savingsIn, outflow = spend + t.savings;
    const close = open + inflow - outflow;
    rows.push({ m, open, income: t.income, savingsIn: t.savingsIn, spend, savings: t.savings, net: inflow - outflow, close });
    open = close;
  }
  return rows;
}

/* ---------- Splitwise-style groups ---------- */
function computeSplits(amount, method, entries) {
  /* entries: [{ m, on, value }] -> [{ m, share, units?, pct? }] in paise */
  const on = entries.filter(e => e.on);
  if (!on.length) throw new Error('Choose at least one person to split with.');
  const spread = weights => {
    const tot = weights.reduce((a, b) => a + b, 0);
    if (!(tot > 0)) throw new Error('Enter shares greater than zero.');
    const raw = weights.map(w => amount * w / tot), base = raw.map(Math.floor);
    let rem = amount - base.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { base[i]++; rem--; } });
    return base;
  };
  if (method === 'equal') { const s = spread(on.map(() => 1)); return on.map((e, i) => ({ m: e.m, share: s[i], units: 1 })); }
  if (method === 'shares') { const w = on.map(e => Number(e.value) || 0); if (w.some(x => x < 0)) throw new Error('Shares cannot be negative.'); const s = spread(w); return on.map((e, i) => ({ m: e.m, share: s[i], units: w[i] })).filter(x => x.units > 0); }
  if (method === 'percent') {
    const p = on.map(e => Number(e.value) || 0), tot = p.reduce((a, b) => a + b, 0);
    if (Math.abs(tot - 100) > 0.01) throw new Error(`Percentages add up to ${Math.round(tot * 100) / 100}% - they must total 100%.`);
    const s = spread(p); return on.map((e, i) => ({ m: e.m, share: s[i], pct: p[i] })).filter(x => x.pct > 0);
  }
  const s = on.map(e => toPaise(e.value) || 0), tot = s.reduce((a, b) => a + b, 0);
  if (tot !== amount) throw new Error(`Amounts add up to ${money(tot)} but the bill is ${money(amount)} (difference ${money(amount - tot)}).`);
  return on.map((e, i) => ({ m: e.m, share: s[i] })).filter(x => x.share > 0);
}
function groupBalances(g) {
  const bal = {}; (g.details.members || []).forEach(m => bal[m.id] = 0);
  for (const r of R) {
    if (r.groupId !== g.id) continue;
    if (r.type === 'expense') {
      for (const p of r.details.payers || []) bal[p.m] = (bal[p.m] || 0) + p.amount;
      for (const s of r.details.splits || []) bal[s.m] = (bal[s.m] || 0) - s.share;
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
const memberName = (g, mid) => { const m = (g.details.members || []).find(x => x.id === mid); return m ? (m.userId === USER?.id ? 'You' : m.name) : 'Someone'; };
function myGroupNet(g) { const me = myMember(g); return me ? (groupBalances(g)[me.id] || 0) : 0; }
function friendBalances() {
  /* net with each person across all my groups: + they owe me, - I owe them */
  const map = {};
  for (const g of V('group')) {
    const me = myMember(g); if (!me) continue;
    for (const d of simplify(groupBalances(g))) {
      let other, amt;
      if (d.to === me.id) { other = d.from; amt = d.amount; } else if (d.from === me.id) { other = d.to; amt = -d.amount; } else continue;
      const mm = g.details.members.find(x => x.id === other); if (!mm) continue;
      const key = mm.userId || mm.name.trim().toLowerCase();
      const e = map[key] = map[key] || { name: mm.name, userId: mm.userId, net: 0, groups: [] };
      e.net += amt; if (!e.groups.includes(g.title)) e.groups.push(g.title);
    }
  }
  return Object.values(map).filter(x => x.net).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}
function myDues() { let recv = 0, pay = 0; for (const f of friendBalances()) { if (f.net > 0) recv += f.net; else pay -= f.net; } return { recv, pay }; }

/* ---------- credit cards ---------- */
function lastOnDay(day, ref = today()) {
  const d = parseD(ref);
  let c = new Date(d.getFullYear(), d.getMonth(), Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  if (ymd(c) > ref) { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); c = new Date(p.getFullYear(), p.getMonth(), Math.min(day, new Date(p.getFullYear(), p.getMonth() + 1, 0).getDate())); }
  return ymd(c);
}
function cardStatus(c) {
  const d = c.details;
  const spends = R.filter(r => r.type === 'expense' && r.details?.cardId === c.id);
  const pays = R.filter(r => r.type === 'cardpay' && r.parentId === c.id);
  const totalSpend = sum(spends, r => r.amount), totalPaid = sum(pays, r => r.amount);
  const outstanding = (d.opening || 0) + totalSpend - totalPaid;
  const billDay = Number(d.billDay) || 1, dueDay = Number(d.dueDay) || 20;
  const lastStmt = lastOnDay(billDay);
  const unbilled = sum(spends.filter(r => r.date > lastStmt), r => r.amount);
  const due = Math.max(0, outstanding - unbilled);
  let dueDate = addMonths(lastStmt.slice(0, 7) + '-01', dueDay > billDay ? 0 : 1, dueDay);
  const thisCycle = sum(spends.filter(r => r.date > lastStmt), r => r.amount);
  const limit = d.limit || 0;
  return { outstanding, unbilled, due, dueDate, lastStmt, nextStmt: addMonths(lastStmt, 1, billDay), limit, available: limit ? limit - outstanding : 0, util: pct(outstanding, limit), thisCycle, spends, pays };
}

/* ---------- recurring payments ---------- */
const FREQ = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', halfyearly: 'Every 6 months', yearly: 'Yearly', days: 'Every N days' };
function nextAfter(date, d) {
  switch (d.freq) {
    case 'weekly': return addDays(date, 7);
    case 'days': return addDays(date, Math.max(1, Number(d.every) || 30));
    case 'quarterly': return addMonths(date, 3, d.anchorDay);
    case 'halfyearly': return addMonths(date, 6, d.anchorDay);
    case 'yearly': return addMonths(date, 12, d.anchorDay);
    default: return addMonths(date, 1, d.anchorDay);
  }
}
const perMonthOf = (amt, d) => ({ weekly: amt * 52 / 12, days: amt * 30.44 / Math.max(1, Number(d.every) || 30), quarterly: amt / 3, halfyearly: amt / 6, yearly: amt / 12 }[d.freq] ?? amt);
function recurringPayments(r) { return R.filter(x => x.type === 'expense' && x.details?.recurringId === r.id).sort((a, b) => b.date.localeCompare(a.date)); }

/* ---------- RD / chit / SIP ---------- */
const SCHEME_KIND = { rd: 'Recurring Deposit (RD)', chit: 'Chit fund', sip: 'SIP / Mutual fund', other: 'Other savings plan' };
function schemeStatus(s) {
  const d = s.details;
  const items = R.filter(r => r.type === 'installment' && r.parentId === s.id).sort((a, b) => a.date.localeCompare(b.date));
  const outs = items.filter(r => r.details?.direction !== 'in'), ins = items.filter(r => r.details?.direction === 'in');
  const paid = sum(outs, r => r.amount), received = sum(ins, r => r.amount), dividends = sum(outs, r => r.details?.dividend || 0);
  const tenure = Number(d.tenure) || 0, count = outs.length;
  const pending = Math.max(0, tenure - count);
  const nextDue = pending && d.startDate ? addMonths(d.startDate, count, Number(d.dueDay) || parseD(d.startDate).getDate()) : null;
  const endDate = d.startDate && tenure ? addMonths(d.startDate, tenure - 1, Number(d.dueDay) || parseD(d.startDate).getDate()) : null;
  let maturity = 0;
  if (s.details.kind === 'rd' && d.installment && tenure) {
    const r = (Number(d.rate) || 0) / 400;
    for (let k = 1; k <= tenure; k++) maturity += d.installment * Math.pow(1 + r, k / 3);
    maturity = Math.round(maturity);
  }
  const expectedPay = paid + pending * (d.installment || 0);
  let projected = 0;
  if (s.details.kind === 'chit') projected = (d.prizeTaken ? received : (d.chitValue || 0) + received) - expectedPay;
  else if (s.details.kind === 'rd') projected = maturity - (d.installment || 0) * tenure;
  return { items, outs, ins, paid, received, dividends, count, tenure, pending, nextDue, endDate, maturity, progress: pct(count, tenure), overdue: !!nextDue && nextDue < today(), projected, net: received - paid };
}

/* ---------- big purchase goals ---------- */
function goalStatus(g) {
  const saves = R.filter(r => r.type === 'goalsave' && r.parentId === g.id).sort((a, b) => b.date.localeCompare(a.date));
  const saved = sum(saves, r => r.details?.direction === 'in' ? -r.amount : r.amount);
  const remaining = Math.max(0, (g.amount || 0) - saved);
  const monthsLeft = g.date ? Math.max(1, monthsBetween(curMonth(), g.date.slice(0, 7)) + 1) : 0;
  return { saves, saved, remaining, monthsLeft, perMonth: monthsLeft ? Math.ceil(remaining / monthsLeft) : 0, progress: clamp(pct(saved, g.amount), 0, 100) };
}

/* ---------- reminders ---------- */
const REPEAT = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const BEFORE = { 0: 'At the time', 15: '15 minutes before', 60: '1 hour before', 1440: '1 day before', 4320: '3 days before' };
const remAt = r => new Date(`${r.date}T${r.details.time || '09:00'}`);
const remOverdue = r => r.status === 'pending' && remAt(r) < new Date();
function nextRemDate(s, rep, anchor) {
  if (rep === 'daily') return addDays(s, 1);
  if (rep === 'weekly') return addDays(s, 7);
  if (rep === 'monthly') return addMonths(s, 1, anchor);
  if (rep === 'yearly') return addMonths(s, 12, anchor);
  return s;
}

/* ---------- tasks ---------- */
const TASK_STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const PROJ_STATUS = { not_started: 'Not started', in_progress: 'In progress', on_hold: 'On hold', completed: 'Completed' };
const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' };
function projStats(pid) {
  const tasks = V('task', t => t.parentId === pid), t = today();
  const done = tasks.filter(x => x.status === 'done').length;
  return { tasks, total: tasks.length, done, open: tasks.length - done, overdue: tasks.filter(x => x.status !== 'done' && x.date && x.date < t).length, pct: pct(done, tasks.length) };
}

/* ---------- upcoming payments across the planner ---------- */
function upcoming(days = 30) {
  const lim = addDays(today(), days), out = [];
  for (const r of V('recurring', r => r.status !== 'paused' && r.status !== 'ended'))
    if (r.date && r.date <= lim) out.push({ kind: 'bill', icon: catIcon(r.category), title: r.title, date: r.date, amount: r.amount, ref: r });
  for (const c of V('card')) { const s = cardStatus(c); if (s.due > 0 && s.dueDate <= lim) out.push({ kind: 'card', icon: '💳', title: `${c.title} bill`, date: s.dueDate, amount: s.due, ref: c }); }
  for (const sc of V('scheme', s => s.status !== 'closed')) { const s = schemeStatus(sc); if (s.nextDue && s.nextDue <= lim) out.push({ kind: 'scheme', icon: sc.details.kind === 'chit' ? '🤝' : '🏦', title: `${sc.title} installment`, date: s.nextDue, amount: sc.details.installment, ref: sc }); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
