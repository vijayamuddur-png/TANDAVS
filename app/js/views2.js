/* LifeManager Pro — screens part 2: split, plan, tasks, analytics, menu */
'use strict';

/* ================= SPLIT (Splitwise style) ================= */
function splitView() {
  header('Split', 'Friends & family groups');
  const k = ui.split.kind;
  const groups = V('group', g => k === 'all' || (g.details.kind || 'friends') === k).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const fr = friendBalances(), { recv, pay } = myDues();
  return `<div class="grid2">
      <div class="card stat tint-inc"><div class="label">You'll get back</div><div class="val pos num">${money(recv)}</div></div>
      <div class="card stat tint-exp"><div class="label">You owe</div><div class="val neg num">${money(pay)}</div></div></div>
    ${fr.length ? `<div class="section"><div class="section-h"><h2>People</h2></div><div class="list">${fr.slice(0, 8).map(f => `<div class="item" style="cursor:default">
      <span class="av" style="background:${colorFor(f.name)}">${esc(initials(f.name))}</span>
      <div class="main"><div class="ttl">${esc(f.name)}</div><div class="sub">${esc(f.groups.join(', '))}</div></div>
      <div class="amt num ${f.net > 0 ? 'pos' : 'neg'}">${money(Math.abs(f.net))}<small>${f.net > 0 ? 'owes you' : 'you owe'}</small></div></div>`).join('')}</div></div>` : ''}
    <div class="section">${seg('split-kind', k, [['all', 'All groups'], ['friends', '🧑‍🤝‍🧑 Friends'], ['family', '👪 Family']])}</div>
    <div class="section">${groups.length ? `<div class="list">${groups.map(g => {
      const net = myGroupNet(g), tot = sum(R.filter(r => r.groupId === g.id && r.type === 'expense'), r => r.amount);
      return `<button class="item" data-act="nav" data-to="group/${g.id}"><div class="ico" style="background:${colorFor(g.title)}">${g.details.kind === 'family' ? '👪' : '🤝'}</div>
        <div class="main"><div class="ttl">${esc(g.title)}</div><div class="sub">${g.details.members.length} members · total ${esc(moneyShort(tot))}</div></div>
        <div class="amt num ${net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted'}" style="font-size:.9rem">${net > 0 ? 'you get ' + money(net) : net < 0 ? 'you owe ' + money(-net) : 'settled ✓'}</div></button>`;
    }).join('')}</div>` : emptyBox('🤝', 'Create a group for a trip, dinner, flatmates or family pooling.', '<button class="btn" data-act="add-group">Create group</button>')}</div>
    ${fab('add-group', 'New group')}`;
}
function groupView(id) {
  const g = byId(id);
  if (!g || !canSee(g)) { go('split', true); return ''; }
  header(g.title, g.details.kind === 'family' ? 'Family group' : 'Friends group', true);
  const bal = groupBalances(g), dues = simplify(bal), me = myMember(g);
  const acts = R.filter(r => r.groupId === id && (r.type === 'expense' || r.type === 'settlement')).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const total = sum(acts.filter(r => r.type === 'expense'), r => r.amount);
  const byCat = groupBy(acts.filter(r => r.type === 'expense'), r => r.category || 'Other');
  return `<div class="hero">
      <div class="label">Total group spending</div><div class="big num">${money(total)}</div>
      <div class="sub">${me ? (bal[me.id] > 0 ? `You get back ${money(bal[me.id])}` : bal[me.id] < 0 ? `You owe ${money(-bal[me.id])}` : 'You are settled up ✓') : ''}</div>
      <div class="member-chips">${g.details.members.map(m => { const v = bal[m.id] || 0; return `<span class="chip" style="background:rgba(255,255,255,.2);color:#fff">${esc(m.userId === USER.id ? 'You' : m.name)} ${v ? (v > 0 ? '+' : '−') + moneyShort(Math.abs(v)) : '✓'}</span>`; }).join('')}</div>
    </div>
    <div class="btn-row section"><button class="btn" data-act="add-gexp" data-id="${id}">${I.plus} Add expense</button><button class="btn ghost" data-act="add-settle" data-id="${id}">🤝 Settle up</button></div>
    <div class="section"><div class="section-h"><h2>Who owes whom</h2><span class="muted tiny">simplified</span></div>
      ${dues.length ? `<div class="list">${dues.map(d => `<div class="item" style="cursor:default">
        <span class="av" style="background:${colorFor(memberName(g, d.from))}">${esc(initials(memberName(g, d.from)))}</span>
        <div class="main"><div class="ttl">${esc(memberName(g, d.from))} → ${esc(memberName(g, d.to))}</div><div class="sub num">${money(d.amount)}</div></div>
        ${me && d.to === me.id ? `<button class="btn sm ghost" data-act="nudge" data-id="${id}" data-p="${esc(d.from)}" data-a="${d.amount}">${I.whatsapp}</button>` : ''}
        <button class="btn sm" data-act="add-settle" data-id="${id}" data-from="${d.from}" data-to="${d.to}" data-a="${d.amount}">Settle</button></div>`).join('')}</div>` : emptyBox('🎉', 'Everyone is settled up.')}</div>
    ${Object.keys(byCat).length > 1 ? `<div class="card section">${donutChart(Object.entries(byCat).map(([c, l], i) => ({ label: c, value: sum(l, r => r.amount), color: PALETTE[i % PALETTE.length] })), { center: 'Spent' })}</div>` : ''}
    <div class="section"><div class="section-h"><h2>Activity</h2><button class="link" data-act="edit-group" data-id="${id}">Edit group</button></div>
    ${acts.length ? `<div class="list">${acts.map(r => r.type === 'expense' ? (() => {
      const payers = (r.details.payers || []).map(p => memberName(g, p.m)), mine = me ? (r.details.splits || []).find(s => s.m === me.id) : null;
      const mpaid = me ? sum((r.details.payers || []).filter(p => p.m === me.id), p => p.amount) : 0;
      const lent = mpaid - (mine?.share || 0);
      return `<button class="item" data-act="edit-gexp" data-id="${r.id}">${icoCat(r.category)}
        <div class="main"><div class="ttl">${esc(r.title)}</div><div class="sub">${esc(payers.join(' + '))} paid · ${esc({ equal: 'equally', shares: 'by shares', exact: 'exact amounts', percent: 'by %' }[r.details.splitMethod] || '')} · ${esc(fmtDate(r.date))}</div></div>
        <div class="amt num">${money(r.amount)}<small class="${lent > 0 ? 'pos' : lent < 0 ? 'neg' : ''}">${me ? (lent > 0 ? 'you lent ' + moneyShort(lent) : lent < 0 ? 'you borrowed ' + moneyShort(-lent) : 'not involved') : ''}</small></div></button>`;
    })() : `<button class="item" data-act="edit-settle" data-id="${r.id}"><div class="ico" style="background:var(--c-inc)">${I.tick}</div>
        <div class="main"><div class="ttl">${esc(memberName(g, r.details.from))} paid ${esc(memberName(g, r.details.to))}</div><div class="sub">Settle-up${r.details.mode ? ' · ' + esc(r.details.mode) : ''} · ${esc(fmtDate(r.date))}</div></div>
        <div class="amt num pos">${money(r.amount)}</div></button>`).join('')}</div>` : emptyBox('🧾', 'No expenses yet.')}</div>`;
}

/* ================= PLAN ================= */
function planView() {
  header('Planner', 'Bills · cards · savings · goals');
  const t = ui.plan.tab;
  return `${seg('plan-tab', t, [['bills', '🔁 Bills'], ['cards', '💳 Cards'], ['savings', '🏦 RD & Chits'], ['goals', '🎯 Big buys']], 'grad')}
    ${t === 'cards' ? cardsPanel() : t === 'savings' ? savingsPanel() : t === 'goals' ? goalsPanel() : billsPanel()}`;
}
function billsPanel() {
  const all = V('recurring').sort((a, b) => (a.status === 'paused') - (b.status === 'paused') || (a.date || '').localeCompare(b.date || ''));
  const active = all.filter(r => r.status !== 'paused' && r.status !== 'ended');
  const monthly = sum(active.filter(r => r.amount), r => perMonthOf(r.amount, r.details));
  const td = today();
  const dueSoon = active.filter(r => r.date <= addDays(td, 7));
  return `<div class="grid2 section">
      <div class="card stat tint-info"><div class="label">Monthly commitment</div><div class="val num">${money(Math.round(monthly))}</div></div>
      <div class="card stat ${dueSoon.length ? 'tint-sav' : 'tint-inc'}"><div class="label">Due in 7 days</div><div class="val num">${dueSoon.length}</div></div></div>
    <div class="section">${all.length ? `<div class="list">${all.map(billItem).join('')}</div>` : emptyBox('🔁', 'Add rent, EMIs, insurance, school fees, subscriptions… Amount can be left blank and entered when you pay.', '<button class="btn" data-act="add-bill">Add recurring payment</button>')}</div>
    ${fab('add-bill', 'Add recurring payment')}`;
}
function billItem(r) {
  const paused = r.status === 'paused' || r.status === 'ended', n = r.date ? daysBetween(today(), r.date) : 99;
  return `<div class="item" data-act="nav" data-to="bill/${r.id}">${icoCat(r.category)}
    <div class="main"><div class="ttl">${esc(r.title)}</div><div class="sub">${esc(FREQ[r.details.freq] || 'Monthly')}${r.details.freq === 'days' ? ' (' + r.details.every + ')' : ''} · ${paused ? 'Paused' : `<span class="${n < 0 ? 'neg' : ''}">${dueText(r.date)}</span>`}${r.scope === 'family' ? ' · Family' : ''}</div></div>
    <div style="text-align:right"><div class="amt num">${r.amount ? money(r.amount) : '<span class="chip grey">varies</span>'}</div>${!paused ? `<button class="btn sm" style="margin-top:.3rem" data-act="pay-bill" data-id="${r.id}">Pay</button>` : ''}</div></div>`;
}
function billView(id) {
  const r = byId(id); if (!r || !canSee(r)) { go('plan', true); return ''; }
  header(r.title, 'Recurring payment', true);
  const hist = recurringPayments(r);
  const amounts = hist.slice(0, 12).reverse();
  return `<div class="hero"><div class="label">${esc(FREQ[r.details.freq] || 'Monthly')} · ${esc(r.category || '')}</div>
      <div class="big num">${r.amount ? money(r.amount) : 'Amount varies'}</div>
      <div class="sub">${r.status === 'paused' ? 'Paused' : `Next due ${fmtDateLong(r.date)} (${dueText(r.date)})`}</div></div>
    <div class="btn-row section">${r.status !== 'paused' ? `<button class="btn" data-act="pay-bill" data-id="${id}">Pay now</button><button class="btn plain" data-act="skip-bill" data-id="${id}">Skip once</button>` : ''}<button class="btn ghost" data-act="edit-bill" data-id="${id}">${I.edit} Edit</button></div>
    <div class="card section">
      <div class="kv"><span>Paid so far</span><b>${hist.length} times · ${money(sum(hist, x => x.amount))}</b></div>
      <div class="kv"><span>Average</span><b>${hist.length ? money(Math.round(sum(hist, x => x.amount) / hist.length)) : '—'}</b></div>
      <div class="kv"><span>Pays from</span><b>${esc(r.details.cardId ? '💳 ' + (byId(r.details.cardId)?.title || 'card') : r.details.mode || '—')}</b></div>
      <div class="kv"><span>Reminder email</span><b>${r.details.remindDays ? r.details.remindDays + ' day(s) before' : 'On due date'}</b></div>
      ${r.details.endDate ? `<div class="kv"><span>Ends</span><b>${fmtDate(r.details.endDate)}</b></div>` : ''}
    </div>
    ${amounts.length > 1 ? `<div class="card section"><h2 style="margin-bottom:.6rem">Amount history</h2>${barChart(amounts.map(x => fmtMon(x.date.slice(0, 7))), [{ name: 'Paid', color: CH.a, values: amounts.map(x => x.amount) }])}</div>` : ''}
    <div class="section"><div class="section-h"><h2>Payments</h2></div>${hist.length ? `<div class="list">${hist.map(txnItem).join('')}</div>` : emptyBox('🧾', 'No payments recorded yet.')}</div>`;
}
const CARD_GRADS = ['linear-gradient(135deg,#1e293b,#475569)', 'linear-gradient(135deg,#7c3aed,#db2777)', 'linear-gradient(135deg,#0ea5e9,#2563eb)', 'linear-gradient(135deg,#059669,#14b8a6)', 'linear-gradient(135deg,#f97316,#e11d48)', 'linear-gradient(135deg,#a16207,#ca8a04)'];
function cardVisual(c, s) {
  return `<div class="ccard" style="background:${CARD_GRADS[(c.details.style || 0) % CARD_GRADS.length]}" data-act="nav" data-to="card/${c.id}">
    <div class="top"><span>${esc(c.details.bank || 'Bank')}</span><span>${esc(c.details.network || '')}</span></div>
    <div class="no">•••• •••• •••• ${esc(c.details.last4 || '0000')}</div>
    <div class="bot"><div>Outstanding<b>${money(s.outstanding)}</b></div><div style="text-align:right">${s.due > 0 ? `Due ${esc(fmtDate(s.dueDate))}<b>${money(s.due)}</b>` : `<b>No dues ✓</b>`}</div></div></div>`;
}
function cardsPanel() {
  const cards = V('card');
  const tot = cards.map(c => cardStatus(c));
  const out = sum(tot, s => s.outstanding), lim = sum(tot, s => s.limit), due = sum(tot, s => s.due);
  return `<div class="grid3 section">
      <div class="card stat tint-exp"><div class="label">Outstanding</div><div class="val num" style="font-size:1.05rem">${money(out)}</div></div>
      <div class="card stat tint-sav"><div class="label">Due now</div><div class="val num" style="font-size:1.05rem">${money(due)}</div></div>
      <div class="card stat tint-info"><div class="label">Utilisation</div><div class="val num" style="font-size:1.05rem">${pct(out, lim)}%</div></div></div>
    <div class="section" style="display:grid;gap:.9rem">${cards.length ? cards.map((c, i) => cardVisual(c, tot[i])).join('') : emptyBox('💳', 'Add your credit cards to track spending, dues and limits. Only the last 4 digits are stored — never the full number or CVV.', '<button class="btn" data-act="add-card">Add credit card</button>')}</div>
    ${fab('add-card', 'Add card')}`;
}
function cardView(id) {
  const c = byId(id); if (!c || !canSee(c)) { go('plan', true); return ''; }
  header(c.title, 'Credit card', true);
  const s = cardStatus(c);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(curMonth(), i - 5));
  const hist = [...s.spends, ...s.pays.map(p => ({ ...p, _pay: true }))].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 40);
  return `${cardVisual(c, s)}
    <div class="btn-row section"><button class="btn" data-act="pay-card" data-id="${id}">Pay bill</button><button class="btn ghost" data-act="add-txn" data-card="${id}">${I.plus} Card spend</button><button class="btn plain" data-act="edit-card" data-id="${id}">${I.edit}</button></div>
    <div class="card section">
      <div class="kv"><span>Amount due</span><b class="${s.due ? 'neg' : 'pos'}">${s.due ? money(s.due) + ' by ' + fmtDate(s.dueDate) : 'Nothing due ✓'}</b></div>
      <div class="kv"><span>Unbilled (since ${fmtDate(s.lastStmt)})</span><b>${money(s.unbilled)}</b></div>
      <div class="kv"><span>Next statement</span><b>${fmtDate(s.nextStmt)}</b></div>
      ${s.limit ? `<div class="kv"><span>Credit limit</span><b>${money(s.limit)}</b></div><div class="kv"><span>Available</span><b>${money(s.available)}</b></div>` : ''}
      ${s.limit ? `<div style="margin-top:.6rem"><div class="hbar-top"><span>Utilisation</span><b>${s.util}%</b></div><div class="bar ${s.util > 70 ? 'over' : s.util > 30 ? 'warn' : 'ok'}"><i style="width:${clamp(s.util, 1, 100)}%"></i></div><div class="hbar-sub">Keeping it under 30% is healthy for your credit score.</div></div>` : ''}
    </div>
    <div class="card section"><h2 style="margin-bottom:.6rem">Monthly card spend</h2>${barChart(months.map(fmtMon), [{ name: 'Spend', color: CH.exp, values: months.map(m => sum(s.spends.filter(r => r.date.startsWith(m)), r => r.amount)) }, { name: 'Paid', color: CH.inc, values: months.map(m => sum(s.pays.filter(r => r.date.startsWith(m)), r => r.amount)) }])}</div>
    <div class="section"><div class="section-h"><h2>Transactions</h2></div>${hist.length ? `<div class="list">${hist.map(r => r._pay ? `<button class="item" data-act="edit-cardpay" data-id="${r.id}"><div class="ico" style="background:var(--c-inc)">${I.tick}</div><div class="main"><div class="ttl">Bill payment</div><div class="sub">${esc(r.details.mode || '')} · ${esc(fmtDate(r.date))}</div></div><div class="amt num pos">${money(r.amount)}</div></button>` : txnItem(r)).join('')}</div>` : emptyBox('🧾', 'No card transactions yet. When you add an expense, choose this card as the payment mode.')}</div>`;
}
function savingsPanel() {
  const list = V('scheme').sort((a, b) => (a.status === 'closed') - (b.status === 'closed'));
  const st = list.map(schemeStatus);
  return `<div class="grid2 section">
      <div class="card stat tint-sav"><div class="label">Total invested</div><div class="val num">${money(sum(st, s => s.paid))}</div></div>
      <div class="card stat tint-inc"><div class="label">Received back</div><div class="val num">${money(sum(st, s => s.received))}</div></div></div>
    <div class="section">${list.length ? `<div class="list">${list.map((s, i) => schemeItem(s, st[i])).join('')}</div>` : emptyBox('🏦', 'Track Recurring Deposits, chit funds, SIPs or any monthly savings plan — installments, dividends, prize money and maturity.', '<button class="btn" data-act="add-scheme">Add RD / chit</button>')}</div>
    ${fab('add-scheme', 'Add savings plan')}`;
}
function schemeItem(s, st) {
  return `<button class="item" data-act="nav" data-to="scheme/${s.id}"><div style="flex:none">${ring(st.progress, 48, s.details.kind === 'chit' ? 'var(--c-sav)' : 'var(--c-inc)')}</div>
    <div class="main"><div class="ttl">${esc(s.title)}</div><div class="sub">${esc(SCHEME_KIND[s.details.kind] || '')} · ${st.count}/${st.tenure || '?'} paid${st.nextDue ? ` · <span class="${st.overdue ? 'neg' : ''}">${dueText(st.nextDue)}</span>` : s.status === 'closed' ? ' · closed' : ''}</div></div>
    <div class="amt num">${money(st.paid)}<small>of ${moneyShort((s.details.installment || 0) * (st.tenure || 0))}</small></div></button>`;
}
function schemeView(id) {
  const s = byId(id); if (!s || !canSee(s)) { go('plan', true); return ''; }
  header(s.title, SCHEME_KIND[s.details.kind] || 'Savings', true);
  const st = schemeStatus(s), d = s.details, chit = d.kind === 'chit';
  return `<div class="hero"><div class="label">${esc(d.bank || d.organizer || '')}${d.bank || d.organizer ? ' · ' : ''}${money(d.installment || 0)}/month · ${st.tenure} months</div>
      <div class="big num">${money(st.paid)}</div><div class="sub">paid in ${st.count} installment${st.count === 1 ? '' : 's'} · ${st.pending} pending${st.nextDue ? ` · next ${fmtDate(st.nextDue)}` : ''}</div>
      <div class="bar"><i style="width:${clamp(st.progress, 1, 100)}%"></i></div></div>
    <div class="btn-row section">${st.pending ? `<button class="btn" data-act="pay-inst" data-id="${id}">Pay installment</button>` : ''}<button class="btn ghost" data-act="receive-inst" data-id="${id}">${chit ? '🏆 Prize / payout' : '💰 Maturity / withdrawal'}</button><button class="btn plain" data-act="edit-scheme" data-id="${id}">${I.edit}</button></div>
    <div class="card section">
      <div class="kv"><span>Started</span><b>${fmtDate(d.startDate)}</b></div>
      <div class="kv"><span>Ends</span><b>${fmtDate(st.endDate)}</b></div>
      ${d.kind === 'rd' ? `<div class="kv"><span>Interest rate</span><b>${d.rate || 0}% p.a.</b></div><div class="kv"><span>Maturity (approx.)</span><b class="pos">${money(st.maturity)}</b></div><div class="kv"><span>Interest earned (approx.)</span><b class="pos">${money(st.projected)}</b></div>` : ''}
      ${chit ? `<div class="kv"><span>Chit value</span><b>${money(d.chitValue || 0)}</b></div><div class="kv"><span>Dividends earned</span><b class="pos">${money(st.dividends)}</b></div>
        <div class="kv"><span>Prize</span><b>${d.prizeTaken ? `Taken${d.prizeMonth ? ' in month ' + d.prizeMonth : ''}` : 'Not taken yet'}</b></div>
        <div class="kv"><span>Received so far</span><b>${money(st.received)}</b></div>
        <div class="kv"><span>Projected gain / loss</span><b class="${st.projected >= 0 ? 'pos' : 'neg'}">${money(st.projected)}</b></div>` : ''}
      ${!chit && d.kind !== 'rd' ? `<div class="kv"><span>Received / withdrawn</span><b>${money(st.received)}</b></div>` : ''}
    </div>
    ${st.items.length > 1 ? `<div class="card section"><h2 style="margin-bottom:.6rem">Installments</h2>${barChart(st.outs.slice(-12).map(x => fmtMon(x.date.slice(0, 7))), [{ name: 'Paid', color: CH.sav, values: st.outs.slice(-12).map(x => x.amount) }, ...(chit ? [{ name: 'Dividend', color: CH.inc, values: st.outs.slice(-12).map(x => x.details.dividend || 0) }] : [])])}</div>` : ''}
    <div class="section"><div class="section-h"><h2>History</h2></div>${st.items.length ? `<div class="list">${st.items.slice().reverse().map(x => `<button class="item" data-act="edit-inst" data-id="${x.id}">
      <div class="ico" style="background:${x.details.direction === 'in' ? 'var(--c-inc)' : 'var(--c-sav)'}">${x.details.direction === 'in' ? I.income : I.expense}</div>
      <div class="main"><div class="ttl">${x.details.direction === 'in' ? esc(x.details.note || 'Received') : `Installment ${x.details.no || ''}`}</div><div class="sub">${esc(fmtDate(x.date))}${x.details.dividend ? ' · dividend ' + money(x.details.dividend) : ''}${x.details.note && x.details.direction !== 'in' ? ' · ' + esc(x.details.note) : ''}</div></div>
      <div class="amt num ${x.details.direction === 'in' ? 'pos' : ''}">${x.details.direction === 'in' ? '+' : ''}${money(x.amount)}</div></button>`).join('')}</div>` : emptyBox('🧾', 'No installments recorded yet.')}</div>`;
}
function goalsPanel() {
  const list = V('goal').sort((a, b) => ['saving', 'planning'].includes(b.details.status) - ['saving', 'planning'].includes(a.details.status) || (a.date || '9').localeCompare(b.date || '9'));
  const act = list.filter(g => !['bought', 'dropped'].includes(g.details.status));
  const st = act.map(goalStatus);
  return `<div class="grid2 section">
      <div class="card stat tint-info"><div class="label">Planned</div><div class="val num">${money(sum(act, g => g.amount))}</div></div>
      <div class="card stat tint-inc"><div class="label">Saved so far</div><div class="val num">${money(sum(st, s => s.saved))}</div></div></div>
    <div class="section">${list.length ? `<div class="list">${list.map(goalItem).join('')}</div>` : emptyBox('🎯', 'Planning a car, phone, TV, furniture or a trip? Set a target and track how much to save each month.', '<button class="btn" data-act="add-goal">Plan a big purchase</button>')}</div>
    ${fab('add-goal', 'New goal')}`;
}
function goalItem(g) {
  const s = goalStatus(g), done = g.details.status === 'bought', drop = g.details.status === 'dropped';
  return `<button class="item" data-act="nav" data-to="goal/${g.id}"><div class="ico soft" style="background:${colorFor(g.title)}22">${esc(g.details.emoji || '🎯')}</div>
    <div class="main"><div class="ttl">${esc(g.title)}</div><div class="sub">${done ? '✅ Bought' : drop ? 'Dropped' : `${s.progress}% saved${g.date ? ` · by ${fmtDate(g.date)} · ${moneyShort(s.perMonth)}/mo` : ''}`}</div>
      ${!done && !drop ? `<div class="bar" style="margin-top:.35rem;height:.4rem"><i style="width:${clamp(s.progress, 1, 100)}%"></i></div>` : ''}</div>
    <div class="amt num">${money(g.amount)}<small>${PRIORITY[g.details.priority] || ''}</small></div></button>`;
}
function goalView(id) {
  const g = byId(id); if (!g || !canSee(g)) { go('plan', true); return ''; }
  header(g.title, 'Big purchase', true);
  const s = goalStatus(g), d = g.details, done = d.status === 'bought';
  return `<div class="hero"><div class="label">${esc(d.emoji || '🎯')} Target ${money(g.amount)}${g.date ? ' by ' + fmtDate(g.date) : ''}</div>
      <div class="big num">${money(s.saved)}</div><div class="sub">${done ? `Bought for ${money(d.boughtAmount || g.amount)} on ${fmtDate(d.boughtDate)}` : `saved · ${money(s.remaining)} to go${s.monthsLeft ? ` · save ${money(s.perMonth)}/month` : ''}`}</div>
      <div class="bar"><i style="width:${clamp(s.progress, 1, 100)}%"></i></div></div>
    ${!done ? `<div class="btn-row section"><button class="btn" data-act="goal-save" data-id="${id}">${I.plus} Add savings</button><button class="btn ghost" data-act="goal-bought" data-id="${id}">🛍️ Mark bought</button><button class="btn plain" data-act="edit-goal" data-id="${id}">${I.edit}</button></div>` : `<div class="btn-row section"><button class="btn plain" data-act="edit-goal" data-id="${id}">${I.edit} Edit</button></div>`}
    <div class="card section">
      <div class="kv"><span>Priority</span><b>${PRIORITY[d.priority] || '—'}</b></div>
      <div class="kv"><span>For</span><b>${scopeLabel(g.scope)}</b></div>
      ${d.notes ? `<div class="kv"><span>Notes</span><b style="white-space:pre-wrap">${esc(d.notes)}</b></div>` : ''}
    </div>
    <div class="section"><div class="section-h"><h2>Savings added</h2></div>${s.saves.length ? `<div class="list">${s.saves.map(x => `<button class="item" data-act="edit-goalsave" data-id="${x.id}"><div class="ico" style="background:${x.details.direction === 'in' ? 'var(--c-exp)' : 'var(--c-inc)'}">${x.details.direction === 'in' ? I.expense : I.income}</div>
      <div class="main"><div class="ttl">${x.details.direction === 'in' ? 'Withdrawn' : 'Saved'}</div><div class="sub">${esc(fmtDate(x.date))}${x.details.note ? ' · ' + esc(x.details.note) : ''}</div></div><div class="amt num">${money(x.amount)}</div></button>`).join('')}</div>` : emptyBox('🐷', 'Add money as you save towards this purchase.')}</div>`;
}

/* ================= TASKS ================= */
function tasksView() {
  header('Tasks', 'To-dos · projects · reminders');
  const t = ui.tasks.tab;
  return `${seg('tasks-tab', t, [['tasks', '✅ Tasks'], ['projects', '📁 Projects'], ['reminders', '🔔 Reminders']], 'grad')}
    ${t === 'projects' ? projectsPanel() : t === 'reminders' ? remindersPanel() : tasksPanel()}`;
}
function taskItem(k, showProject) {
  const p = k.parentId ? byId(k.parentId) : null, od = k.status !== 'done' && k.date && k.date < today();
  const who = k.details.assignee ? byId(k.details.assignee) : null;
  return `<div class="item" data-act="edit-task" data-id="${k.id}">
    <button class="check ${k.status === 'done' ? 'done' : ''}" data-act="toggle-task" data-id="${k.id}" aria-label="Done">${k.status === 'done' ? I.tick : ''}</button>
    <div class="main"><div class="ttl" style="${k.status === 'done' ? 'text-decoration:line-through;opacity:.55' : ''}">${k.details.priority === 'high' && k.status !== 'done' ? '🔥 ' : ''}${esc(k.title)}</div>
      <div class="sub">${esc([showProject && p ? '📁 ' + p.title : null, who ? '👤 ' + (who.id === USER.id ? 'Me' : who.title) : null, k.date ? dueText(k.date) : null].filter(Boolean).join(' · '))}</div></div>
    ${od ? '<span class="chip exp">Overdue</span>' : k.status === 'doing' ? '<span class="chip">In progress</span>' : k.status === 'blocked' ? '<span class="chip sav">Blocked</span>' : ''}</div>`;
}
function tasksPanel() {
  const f = ui.tasks.filter;
  let list = V('task');
  if (f === 'mine') list = list.filter(k => (k.details.assignee || k.owner) === USER.id);
  if (f === 'family') list = list.filter(k => k.scope === 'family');
  const open = list.filter(k => k.status !== 'done').sort((a, b) => (PRIORITY_ORDER[a.details.priority] - PRIORITY_ORDER[b.details.priority]) || (a.date || '9').localeCompare(b.date || '9'));
  const done = list.filter(k => k.status === 'done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15);
  const td = today(), od = open.filter(k => k.date && k.date < td), tdy = open.filter(k => k.date === td), later = open.filter(k => !k.date || k.date > td);
  const sec = (t, l) => l.length ? `<div class="day-h"><span>${t}</span><span>${l.length}</span></div><div class="list">${l.map(k => taskItem(k, true)).join('')}</div>` : '';
  return `<div class="section">${seg('task-filter', f, [['mine', 'Assigned to me'], ['family', 'Family'], ['all', 'All']])}</div>
    <div class="grid3 section"><div class="card stat tint-exp"><div class="label">Overdue</div><div class="val">${od.length}</div></div><div class="card stat tint-sav"><div class="label">Today</div><div class="val">${tdy.length}</div></div><div class="card stat tint-info"><div class="label">Pending</div><div class="val">${open.length}</div></div></div>
    ${open.length ? sec('⚠️ Overdue', od) + sec('📅 Today', tdy) + sec('🗓️ Upcoming & no date', later) : `<div class="section">${emptyBox('🎉', 'All caught up!')}</div>`}
    ${done.length ? sec('✔️ Recently done', done) : ''}
    ${fab('add-task', 'New task')}`;
}
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, undefined: 1 };
function projectsPanel() {
  const ps = V('project').sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (a.date || '9').localeCompare(b.date || '9'));
  return `<div class="section">${ps.length ? `<div class="list">${ps.map(p => { const s = projStats(p.id); return `<button class="item" data-act="nav" data-to="project/${p.id}"><div style="flex:none">${ring(s.pct, 48)}</div>
      <div class="main"><div class="ttl">${esc(p.title)}</div><div class="sub">${s.open} open · ${s.done} done${s.overdue ? ` · <span class="neg">${s.overdue} overdue</span>` : ''}${p.date ? ' · ' + esc(fmtDate(p.date)) : ''}</div></div>
      <span class="chip ${p.status === 'completed' ? 'inc' : p.status === 'on_hold' ? 'sav' : p.status === 'in_progress' ? '' : 'grey'}">${PROJ_STATUS[p.status] || ''}</span></button>`; }).join('')}</div>` : emptyBox('📁', 'Projects group related tasks — house renovation, a wedding, a work deliverable.', '<button class="btn" data-act="add-proj">New project</button>')}</div>
    ${fab('add-proj', 'New project')}`;
}
function projectView(id) {
  const p = byId(id); if (!p || !canSee(p)) { go('tasks', true); return ''; }
  header(p.title, 'Project', true);
  const s = projStats(id), order = ['doing', 'blocked', 'todo', 'done'];
  return `<div class="card" style="display:flex;gap:1rem;align-items:center">${ring(s.pct, 76)}
      <div style="flex:1"><div style="display:flex;gap:.4rem;flex-wrap:wrap"><span class="chip">${PROJ_STATUS[p.status]}</span><span class="chip grey">${scopeLabel(p.scope)}</span>${p.date ? `<span class="chip sav">🏁 ${fmtDate(p.date)}</span>` : ''}</div>
      ${p.details.description ? `<p class="muted small" style="margin:.5rem 0 0">${esc(p.details.description)}</p>` : ''}
      <div class="small" style="margin-top:.4rem"><b>${s.open}</b> open · <b>${s.done}</b> done${s.overdue ? ` · <b class="neg">${s.overdue} overdue</b>` : ''}</div></div>
      <button class="icon-btn" data-act="edit-proj" data-id="${id}">${I.edit}</button></div>
    ${order.map(st => { const l = s.tasks.filter(t => t.status === st); return l.length ? `<div class="day-h"><span>${TASK_STATUS[st]}</span><span>${l.length}</span></div><div class="list">${l.map(k => taskItem(k)).join('')}</div>` : ''; }).join('') || `<div class="section">${emptyBox('📝', 'No tasks yet.')}</div>`}
    <button class="fab" data-act="add-task" data-id="${id}" aria-label="Add task">${I.plus}</button>`;
}
function remItem(r) {
  const od = remOverdue(r), done = r.status === 'completed';
  return `<div class="item" data-act="edit-rem" data-id="${r.id}">
    <button class="check ${done ? 'done' : ''}" data-act="done-rem" data-id="${r.id}" aria-label="Done">${done ? I.tick : ''}</button>
    <div class="main"><div class="ttl" style="${done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(r.title)}</div>
      <div class="sub">${esc(fmtDate(r.date))} · ${esc(fmtTime(r.details.time))}${r.details.repeat && r.details.repeat !== 'none' ? ' · 🔁 ' + REPEAT[r.details.repeat] : ''}${r.details.forUser && r.details.forUser !== USER.id ? ' · for ' + esc(userName(r.details.forUser)) : ''}</div></div>
    <div style="text-align:right">${r.amount ? `<div class="amt num">${money(r.amount)}</div>` : ''}${od ? '<span class="chip exp">Overdue</span>' : ''}</div></div>`;
}
function remindersPanel() {
  const all = V('reminder'), pend = all.filter(r => r.status === 'pending').sort((a, b) => remAt(a) - remAt(b));
  const td = today(), od = pend.filter(remOverdue), tdy = pend.filter(r => r.date === td && !remOverdue(r)), up = pend.filter(r => r.date > td && !remOverdue(r));
  const done = all.filter(r => r.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15);
  const sec = (t, l) => l.length ? `<div class="day-h"><span>${t}</span><span>${l.length}</span></div><div class="list">${l.map(remItem).join('')}</div>` : '';
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `${perm === 'default' ? `<div class="banner info">Allow notifications on this phone for pop-up alerts.<button class="btn sm ghost" data-act="perm">Allow</button></div>` : ''}
    ${pend.length ? sec('⚠️ Overdue', od) + sec('📅 Today', tdy) + sec('🗓️ Upcoming', up) : `<div class="section">${emptyBox('🔔', 'No pending reminders.')}</div>`}
    ${sec('✔️ Done', done)}
    ${fab('add-rem', 'New reminder')}`;
}

/* ================= ANALYTICS ================= */
function analyticsView() {
  header('Analytics', 'Insights', true);
  const st = ui.stats, v = st.view, m = st.month;
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(m, i - 11));
  const mt = months.map(x => monthTotals(x, v));
  const cur = mt[11], prev = mt[10];
  const spendOf = t => v === 'family' ? t.expense : t.spend;
  const change = spendOf(prev) ? Math.round((spendOf(cur) - spendOf(prev)) / spendOf(prev) * 100) : 0;
  const rate = cur.income ? Math.round((cur.income - spendOf(cur)) / cur.income * 100) : 0;
  const list = txns(v, r => r.type === 'expense' && r.date?.startsWith(m));
  const [y, mo] = m.split('-').map(Number), dim = new Date(y, mo, 0).getDate(), lastDay = m === curMonth() ? new Date().getDate() : dim;
  const daily = Array.from({ length: dim }, (_, i) => sum(list.filter(r => Number(r.date.slice(8)) === i + 1), r => r.amount));
  let run = 0; const cum = daily.map((x, i) => i < lastDay ? (run += x) : null);
  const bud = v === 'family' ? SET.details.familyBudget : v === 'personal' ? PREFS.details.budget : (PREFS.details.budget || 0) + (SET.details.familyBudget || 0);
  const byMode = groupBy(list, r => r.details.cardId ? '💳 ' + (byId(r.details.cardId)?.title || 'Card') : r.details.mode || 'Other');
  const byMember = groupBy(txns(v === 'personal' ? 'family' : v, r => r.type === 'expense' && r.date?.startsWith(m) && r.scope === 'family'), r => r.details.paidBy || r.owner);
  const wk = [0, 0, 0, 0, 0, 0, 0]; list.forEach(r => { wk[(parseD(r.date).getDay() + 6) % 7] += r.amount; });
  const top = list.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  const cards = V('card').map(c => ({ c, s: cardStatus(c) }));
  const bills = groupBy(V('recurring', r => r.status !== 'paused' && r.amount), r => r.category || 'Other');
  const avgDaily = lastDay ? Math.round(spendOf(cur) / lastDay) : 0;
  const biggest = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1])[0];
  return `${seg('stats-view', v, [['all', 'Everything'], ['personal', 'Personal'], ['family', 'Family']])}
    ${monthNav('stats-month', m)}
    <div class="kpis">
      <div class="kpi"><small>Spent this month</small><b>${moneyShort(spendOf(cur))}</b><br>${spendOf(prev) ? `<em class="${change > 0 ? 'neg' : 'pos'}">${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${Math.abs(change)}% vs last month</em>` : '<em class="muted">no data last month</em>'}</div>
      <div class="kpi"><small>Savings rate</small><b>${cur.income ? rate + '%' : '—'}</b><br><em class="muted">of income kept</em></div>
      <div class="kpi"><small>Avg per day</small><b>${moneyShort(avgDaily)}</b><br><em class="muted">${lastDay} days</em></div>
      <div class="kpi"><small>Top category</small><b style="font-size:1rem">${biggest ? catIcon(biggest[0]) + ' ' + esc(biggest[0]) : '—'}</b><br><em class="muted">${biggest ? moneyShort(biggest[1]) : ''}</em></div>
    </div>
    <div class="card section"><h2 style="margin-bottom:.7rem">Income vs spending · 12 months</h2>${barChart(months.map(fmtMon), [{ name: 'Income', color: CH.inc, values: mt.map(t => t.income) }, { name: 'Spending', color: CH.exp, values: mt.map(spendOf) }, { name: 'Saved/invested', color: CH.sav, values: mt.map(t => t.savings) }])}</div>
    <div class="card section"><h2 style="margin-bottom:.7rem">Where the money went</h2>${donutChart(Object.entries(cur.byCat).sort((a, b) => b[1] - a[1]).map(([c, x], i) => ({ label: catIcon(c) + ' ' + c, value: x, color: PALETTE[i % PALETTE.length] })), { center: fmtMon(m) })}</div>
    <div class="card section"><h2 style="margin-bottom:.7rem">Spending through the month</h2>${lineChart(daily.map((_, i) => String(i + 1)), [{ name: 'Cumulative spend', color: CH.exp, values: cum, area: true }, ...(bud ? [{ name: 'Budget', color: CH.inc, values: daily.map(() => bud), dash: true }] : [])])}</div>
    <div class="card section"><h2 style="margin-bottom:.7rem">Savings rate trend</h2>${lineChart(months.map(fmtMon), [{ name: 'Savings rate %', color: CH.a, values: mt.map(t => t.income ? Math.round((t.income - spendOf(t)) / t.income * 100) : null), area: true }], { pct: true })}</div>
    <div class="grid2 section" style="align-items:start">
      <div class="card"><h2 style="margin-bottom:.4rem;font-size:1rem">By payment mode</h2>${hbars(Object.entries(byMode).map(([k, l]) => ({ label: k, value: sum(l, r => r.amount) })).sort((a, b) => b.value - a.value))}</div>
      <div class="card"><h2 style="margin-bottom:.4rem;font-size:1rem">By weekday</h2>${hbars(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ label: d, value: wk[i], color: i > 4 ? 'linear-gradient(90deg,#f59e0b,#f43f5e)' : undefined })))}</div>
    </div>
    ${Object.keys(byMember).length ? `<div class="card section"><h2 style="margin-bottom:.4rem">Family spending by member</h2>${hbars(Object.entries(byMember).map(([k, l]) => ({ label: userName(k), value: sum(l, r => r.amount), color: byId(k)?.details.color })).sort((a, b) => b.value - a.value))}</div>` : ''}
    <div class="card section"><h2 style="margin-bottom:.4rem">Top 5 expenses</h2>${top.length ? top.map((r, i) => `<div class="kv"><span>${i + 1}. ${catIcon(r.category)} ${esc(r.title || r.category)} <span class="tiny">${esc(fmtDate(r.date))}</span></span><b>${money(r.amount)}</b></div>`).join('') : '<div class="empty small">No expenses.</div>'}</div>
    ${cards.length ? `<div class="card section"><h2 style="margin-bottom:.4rem">Credit card utilisation</h2>${hbars(cards.map(({ c, s }) => ({ label: `${c.title} ••${c.details.last4 || ''}`, value: s.util, max: 100, text: s.util + '% · ' + moneyShort(s.outstanding), color: s.util > 70 ? 'var(--c-exp)' : s.util > 30 ? 'var(--c-sav)' : 'var(--c-inc)' })))}</div>` : ''}
    ${Object.keys(bills).length ? `<div class="card section"><h2 style="margin-bottom:.4rem">Monthly commitments</h2>${hbars(Object.entries(bills).map(([c, l]) => ({ label: catIcon(c) + ' ' + c, value: Math.round(sum(l, r => perMonthOf(r.amount, r.details))) })).sort((a, b) => b.value - a.value))}</div>` : ''}`;
}

/* ================= MENU / USERS / SETTINGS ================= */
function menuView() {
  header('Menu', SET.details.familyName || 'LifeManager', true);
  const tile = (to, ic, color, title, sub, act = 'nav') => `<button class="tile" data-act="${act}" data-to="${to}"><span class="ti" style="background:${color}">${ic}</span><b>${title}</b><span>${sub}</span></button>`;
  return `<div class="card" style="display:flex;align-items:center;gap:.9rem">${userAv(USER).replace('<span class="av "', '<span class="av" style="width:3.2rem;height:3.2rem;font-size:1.1rem;background:' + (USER.details.color || colorFor(USER.title)) + '"')}
      <div style="flex:1"><b style="font-size:1.1rem">${esc(USER.title)}</b><div class="muted small">@${esc(USER.details.username)} · ${isAdmin() ? '👑 Admin' : 'Member'}</div></div>
      <button class="btn sm danger" data-act="logout">${I.logout} Sign out</button></div>
    <div class="tiles section">
      ${tile('analytics', I.chart, 'linear-gradient(135deg,#8b5cf6,#d946ef)', 'Analytics', 'Charts & insights')}
      ${tile('money', I.budget, 'linear-gradient(135deg,#10b981,#06b6d4)', 'Budget', 'Monthly limits', 'go-budget')}
      ${tile('stmt', I.statement, 'linear-gradient(135deg,#f59e0b,#f43f5e)', 'Carry-forward', 'Surplus / shortage', 'go-stmt')}
      ${tile('cards', I.card, 'linear-gradient(135deg,#334155,#64748b)', 'Credit cards', 'Dues & limits', 'go-plan')}
      ${tile('savings', I.piggy, 'linear-gradient(135deg,#eab308,#f97316)', 'RD & Chits', 'Savings plans', 'go-plan')}
      ${tile('goals', I.target, 'linear-gradient(135deg,#ec4899,#8b5cf6)', 'Big purchases', 'Goals', 'go-plan')}
      ${isAdmin() ? tile('users', I.users, 'linear-gradient(135deg,#2563eb,#7c3aed)', 'Users & logins', 'Admin') : ''}
      ${tile('settings', I.gear, 'linear-gradient(135deg,#0ea5e9,#22c55e)', 'Settings', 'Look, sync, data')}
    </div>
    <p class="muted tiny" style="text-align:center;margin-top:1.4rem">LifeManager v${APP_VERSION} · ${esc(syncState)}</p>`;
}
function usersView() {
  if (!isAdmin()) { go('menu'); return ''; }
  header('Users & logins', 'Admin', true);
  const us = users(true);
  return `<div class="list">${us.map(u => `<button class="item" data-act="edit-user" data-id="${u.id}">${userAv(u)}
      <div class="main"><div class="ttl">${esc(u.title)} ${u.id === USER.id ? '<span class="chip grey">You</span>' : ''}</div><div class="sub">@${esc(u.details.username)} · ${u.details.role === 'admin' ? 'Admin' : 'Member'}${u.details.email ? ' · ' + esc(u.details.email) : ''}</div></div>
      ${u.details.active === false ? '<span class="chip exp">Disabled</span>' : '<span class="chip inc">Active</span>'}</button>`).join('')}</div>
    <button class="btn block section" data-act="add-user">${I.users} Create new login</button>
    <div class="card section"><h2 style="margin-bottom:.4rem">Set up a family member's phone</h2>
      ${CONN ? `<p class="muted small" style="margin:0 0 .8rem">Share this link with them (WhatsApp / email). Opening it connects their phone to your family data; then they sign in with the login you created. The link contains your GitHub key — share it only with family.</p>
      <div class="btn-row"><button class="btn" data-act="share-setup">${I.whatsapp} Share setup link</button><button class="btn ghost" data-act="copy-setup">Copy link</button></div>`
      : '<p class="muted small" style="margin:0">Connect GitHub in Settings first — then you can share a setup link.</p>'}
    </div>
    <p class="muted tiny section">Privacy: each person's <b>Personal</b> money is visible only to them. <b>Family</b> items are visible to everyone with a login. Groups are visible to their members.</p>`;
}
function settingsView() {
  header('Settings', 'Look · household · sync', true);
  const p = PREFS.details, s = SET.details;
  return `<div class="card"><h2 style="margin-bottom:.8rem">🎨 Look &amp; feel</h2>
      <div class="field"><span>Colour theme</span></div>
      <div class="theme-dots">${Object.entries(THEMES).map(([k, t]) => `<button class="${p.theme === k ? 'on' : ''}" style="background:linear-gradient(135deg,${t.a},${t.b})" data-act="set-theme" data-v="${k}" title="${t.name}" aria-label="${t.name}"></button>`).join('')}</div>
      <div class="field"><span>Mode</span></div>${seg('set-mode', p.mode, [['auto', '🌓 Auto'], ['light', '☀️ Light'], ['dark', '🌙 Dark']])}
      <div class="field" style="margin-top:.9rem"><span>Text size</span></div>${seg('set-font', p.font, Object.entries(FONT_SIZES).map(([k, f]) => [k, f.name]))}
    </div>
    <div class="card section"><h2 style="margin-bottom:.8rem">👤 My profile</h2>
      <div class="btn-row"><button class="btn ghost" data-act="edit-profile">Edit name &amp; email</button><button class="btn ghost" data-act="change-pass">${I.lock} Change password</button></div></div>
    ${isAdmin() ? `<form class="card section" id="household-form"><h2 style="margin-bottom:.8rem">🏠 Household (admin)</h2>
      <div class="row2"><label class="field"><span>Family name</span><input name="familyName" value="${esc(s.familyName)}"></label><label class="field"><span>Currency</span><input name="currency" value="${esc(s.currency)}" maxlength="4"></label></div>
      <label class="field"><span>Expense categories (comma separated)</span><textarea name="expenseCategories">${esc(s.expenseCategories.join(', '))}</textarea></label>
      <label class="field"><span>Income categories</span><input name="incomeCategories" value="${esc(s.incomeCategories.join(', '))}"></label>
      <label class="field"><span>Payment modes</span><input name="paymentModes" value="${esc(s.paymentModes.join(', '))}"></label>
      <button class="btn block">Save household</button></form>` : ''}
    <div class="card section"><h2 style="margin-bottom:.4rem">☁️ GitHub sync &amp; email robot</h2>
      ${CONN ? `<p class="muted small" style="margin:0 0 .8rem">Connected to <b>${esc(CONN.repo)}</b> · <b id="sync-state">${esc(syncState)}</b></p>
        <div class="btn-row"><button class="btn" data-act="sync">Sync now</button><button class="btn ghost" data-act="test-email">Test email</button></div>
        ${isAdmin() ? `<div class="btn-row" style="margin-top:.6rem"><button class="btn ghost" data-act="install-robot">Install / update robot</button><button class="btn ghost" data-act="robot-backup">Backup now</button></div>
        <button class="btn plain block" data-act="connect" style="margin-top:.6rem">Change connection</button>` : ''}
        <p class="muted tiny" style="margin:.8rem 0 0">The robot emails bills, card dues, RD/chit installments and reminders to each person's email, plus a 7 AM daily summary.</p>`
      : `<p class="muted small" style="margin:0 0 .8rem">Not connected — data stays only on this phone.</p><button class="btn block" data-act="connect">Connect GitHub</button>`}
    </div>
    <div class="card section"><h2 style="margin-bottom:.4rem">💾 Backup</h2>
      <p class="muted small" style="margin:0 0 .8rem">Download everything you can see as a file, or restore one.</p>
      <div class="btn-row"><button class="btn ghost" data-act="backup">Export backup</button>${isAdmin() ? '<button class="btn ghost" data-act="import">Import backup</button>' : ''}</div>
      <input type="file" id="import-file" accept="application/json,.json" hidden></div>
    ${isAdmin() ? `<div class="card section"><h2 style="margin-bottom:.4rem">⚠️ Danger zone</h2><button class="btn danger block" data-act="wipe">Delete all data</button></div>` : ''}
    <p class="muted tiny" style="text-align:center;margin-top:1.2rem">LifeManager v${APP_VERSION} · ${R.length} records in one table</p>`;
}
