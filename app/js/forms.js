/* LifeManager Pro — forms (bottom sheets) */
'use strict';

function openSheet(title, body, onSubmit, opts = {}) {
  const el = $('#sheet');
  el.innerHTML = `<div class="backdrop" data-act="close"></div>
    <form class="panel" novalidate><div class="grab"></div><h2>${esc(title)}</h2>${body}
      <div class="btn-row" style="margin-top:.6rem">${opts.del ? `<button type="button" class="btn danger" id="sheet-del">Delete</button>` : ''}${opts.extra || ''}<button class="btn" id="sheet-ok">${esc(opts.submit || 'Save')}</button></div></form>`;
  const f = $('form', el);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = $('#sheet-ok', f); ok.disabled = true;
    try { const r = await onSubmit(new FormData(f), f); if (r !== false) { closeSheet(); render(); } }
    catch (err) { console.error(err); alert(err.message || 'Something went wrong'); }
    ok.disabled = false;
  });
  if (opts.del) $('#sheet-del', el).addEventListener('click', async () => { if (confirm(opts.delMsg || 'Delete this item?')) { await opts.del(); closeSheet(); render(); toast('Deleted'); } });
  opts.onOpen?.(f);
  const first = $('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea', f);
  if (first && !opts.noFocus && matchMedia('(min-width: 46rem)').matches) setTimeout(() => first.focus(), 80);
}
function closeSheet() { $('#sheet').innerHTML = ''; }
const fld = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const amountFld = (label, v, name = 'amount', ph = '0') => fld(label, `<input name="${name}" class="amount" inputmode="decimal" placeholder="${ph}" value="${esc(fromPaise(v))}">`);
const scopeSel = (v, label = 'Belongs to') => fld(label, `<select name="scope">${opt('personal', '👤 Personal (only me)', v)}${opt('family', '🏠 Family (everyone)', v)}</select>`);
const userSel = (name, v, label, blank) => fld(label, `<select name="${name}">${blank ? opt('', blank, v) : ''}${users().map(u => opt(u.id, u.id === USER.id ? `${u.title} (me)` : u.title, v)).join('')}</select>`);
const catGrid = (cats, v) => `<div class="cat-grid">${cats.map(c => `<label><input type="radio" name="category" value="${esc(c)}" ${c === v ? 'checked' : ''}><span><em>${catIcon(c)}</em>${esc(c)}</span></label>`).join('')}</div>`;
const modeSel = (mode, cardId) => fld('Paid using', `<select name="paymode">${SET.details.paymentModes.filter(m => m !== 'Credit card').map(m => opt('mode:' + m, m, mode && !cardId ? 'mode:' + mode : '')).join('')}${V('card').map(c => opt('card:' + c.id, `💳 ${c.title} ••${c.details.last4 || ''}`, cardId ? 'card:' + cardId : '')).join('')}${!V('card').length && SET.details.paymentModes.includes('Credit card') ? opt('mode:Credit card', 'Credit card', mode === 'Credit card' ? 'mode:Credit card' : '') : ''}</select>`);
const readMode = fd => { const v = fd.get('paymode') || ''; return v.startsWith('card:') ? { mode: 'Credit card', cardId: v.slice(5) } : { mode: v.slice(5), cardId: null }; };
const needAmount = (v, allowZero) => { const a = toPaise(v); if (!(a > 0) && !(allowZero && a === 0)) throw new Error('Enter a valid amount.'); return a; };

/* ---------- transaction ---------- */
function txnForm(rec, type = 'expense', preset = {}) {
  const r = rec || { type, date: today(), scope: preset.scope || 'personal', category: null, details: { paidBy: USER.id, cardId: preset.cardId || null, mode: preset.cardId ? 'Credit card' : 'UPI' } };
  if (rec && rec.owner !== USER.id && rec.scope !== 'family') return alert('This is someone else\'s personal entry.');
  const catsFor = t => t === 'income' ? SET.details.incomeCategories : SET.details.expenseCategories;
  openSheet(rec ? 'Edit transaction' : r.type === 'income' ? 'Add income' : 'Add expense', `
    <div class="type-toggle"><button type="button" class="exp ${r.type === 'expense' ? 'on' : ''}" data-tt="expense">${I.expense} Expense</button><button type="button" class="inc ${r.type === 'income' ? 'on' : ''}" data-tt="income">${I.income} Income</button></div>
    <input type="hidden" name="type" value="${r.type}">
    ${amountFld('Amount', r.amount)}
    ${fld('Description', `<input name="title" value="${esc(r.title)}" placeholder="e.g. Big Bazaar groceries">`)}
    <div class="field"><span>Category</span></div><div id="cats">${catGrid(catsFor(r.type), r.category || catsFor(r.type)[0])}</div>
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${esc(r.date)}">`)}${scopeSel(r.scope, 'Account')}</div>
    <div class="row2">${modeSel(r.details.mode, r.details.cardId)}<div data-show="family">${userSel('paidBy', r.details.paidBy || r.owner, 'Paid / received by')}</div></div>
    ${fld('Notes', `<textarea name="notes" placeholder="Optional">${esc(r.details.notes)}</textarea>`)}`,
    async fd => {
      const amount = needAmount(fd.get('amount')), t = fd.get('type'), scope = fd.get('scope'), pm = readMode(fd);
      const cat = fd.get('category') || catsFor(t)[0];
      await save({ ...r, id: r.id || uid(t), type: t, amount, title: fd.get('title').trim() || cat, category: cat, date: fd.get('date') || today(), status: 'done', scope,
        details: { ...r.details, mode: pm.mode, cardId: t === 'expense' ? pm.cardId : null, paidBy: scope === 'family' ? fd.get('paidBy') : USER.id, notes: fd.get('notes').trim() } });
      toast(t === 'income' ? 'Income saved' : 'Expense saved');
    },
    { del: rec ? () => removeIds([rec.id]) : null,
      onOpen: f => {
        const sync = () => { $('[data-show=family]', f).style.visibility = f.scope.value === 'family' ? 'visible' : 'hidden'; };
        f.scope.addEventListener('change', sync); sync();
        $$('[data-tt]', f).forEach(b => b.addEventListener('click', () => {
          f.type.value = b.dataset.tt; $$('[data-tt]', f).forEach(x => x.classList.toggle('on', x === b));
          $('#cats', f).innerHTML = catGrid(catsFor(b.dataset.tt), catsFor(b.dataset.tt)[0]);
        }));
      } });
}

/* ---------- budget & opening balance ---------- */
function budgetForm(view) {
  const fam = view === 'family';
  if (fam && !isAdmin()) return alert('Only the admin can change the family budget.');
  const b = budgetFor(view);
  openSheet(fam ? 'Family monthly budget' : 'My monthly budget', `
    ${amountFld('Total monthly budget', b.total, 'total')}
    <p class="hint">Optional limits per category (leave blank for none):</p>
    <div style="max-height:42vh;overflow:auto">${SET.details.expenseCategories.map((c, i) => `<div class="split-row"><label><span>${catIcon(c)} ${esc(c)}</span></label><input class="v" name="c_${i}" inputmode="decimal" placeholder="—" value="${esc(fromPaise(b.cats[c] || ''))}"></div>`).join('')}</div>`,
    async fd => {
      const total = fd.get('total') ? toPaise(fd.get('total')) : 0;
      if (isNaN(total) || total < 0) throw new Error('Enter a valid budget.');
      const cats = {};
      SET.details.expenseCategories.forEach((c, i) => { const v = fd.get('c_' + i); if (v) { const p = toPaise(v); if (p > 0) cats[c] = p; } });
      if (fam) { SET.details.familyBudget = total; SET.details.familyCatBudgets = cats; await save(SET); }
      else { PREFS.details.budget = total; PREFS.details.catBudgets = cats; await save(PREFS); }
      toast('Budget saved');
    });
}
function openingForm(view) {
  const fam = view === 'family';
  const d = fam ? { opening: SET.details.familyOpening, start: SET.details.familyStartMonth } : { opening: PREFS.details.opening, start: PREFS.details.startMonth };
  openSheet('Opening balance', `<p class="hint">Money you had at the start (cash + bank). Each month's surplus or shortage is added to it and carried forward.</p>
    ${fld('Opening balance', `<input name="opening" inputmode="decimal" value="${esc(fromPaise(d.opening || 0))}">`)}
    ${fld('Start month', `<input type="month" name="start" value="${esc(d.start || '')}">`)}<p class="hint">Leave empty to start from your first transaction.</p>`,
    async fd => {
      const o = fd.get('opening') === '' ? 0 : toPaise(fd.get('opening'));
      if (isNaN(o)) throw new Error('Enter a valid amount (use - for a negative balance).');
      if (fam) { SET.details.familyOpening = o; SET.details.familyStartMonth = fd.get('start') || null; await save(SET); }
      else { PREFS.details.opening = o; PREFS.details.startMonth = fd.get('start') || null; await save(PREFS); }
    });
}

/* ---------- groups ---------- */
function groupForm(rec) {
  const g = rec || { details: { kind: 'friends', members: [{ id: uid('mem'), name: USER.title, userId: USER.id }] } };
  const others = g.details.members.filter(m => m.userId !== USER.id);
  openSheet(rec ? 'Edit group' : 'New group', `
    ${fld('Group name', `<input name="title" value="${esc(g.title)}" placeholder="e.g. Goa trip, Flatmates, Parents" required>`)}
    ${fld('Type', `<select name="kind">${opt('friends', '🤝 Friends', g.details.kind)}${opt('family', '👪 Family', g.details.kind)}</select>`)}
    <div class="field"><span>App users in this group</span></div>
    ${users().filter(u => u.id !== USER.id).map(u => `<label class="toggle-row"><input type="checkbox" name="u" value="${u.id}" ${g.details.members.some(m => m.userId === u.id) ? 'checked' : ''}>${userAv(u)} ${esc(u.title)}</label>`).join('') || '<p class="hint">No other logins yet.</p>'}
    ${fld('Other people (one per line)', `<textarea name="people" rows="4" placeholder="Ravi\nAnita\nSuresh">${esc(others.filter(m => !m.userId).map(m => m.name).join('\n'))}</textarea>`)}
    <p class="hint">You are always included. Friends don't need a login.</p>`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a group name.');
      const keep = g.details.members.filter(m => m.userId === USER.id);
      fd.getAll('u').forEach(id => keep.push(g.details.members.find(m => m.userId === id) || { id: uid('mem'), name: byId(id).title, userId: id }));
      const names = [...new Set(fd.get('people').split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
      names.forEach(n => keep.push(g.details.members.find(m => !m.userId && m.name === n) || { id: uid('mem'), name: n, userId: null }));
      if (keep.length < 2) throw new Error('Add at least one other person.');
      if (rec) {
        const removed = g.details.members.filter(m => !keep.some(k => k.id === m.id));
        const used = removed.filter(m => R.some(r => r.groupId === rec.id && JSON.stringify(r.details).includes(m.id)));
        if (used.length) throw new Error(`Can't remove ${used.map(m => m.name).join(', ')} - they appear in expenses or settlements of this group.`);
      }
      const saved = await save({ ...g, id: g.id || uid('group'), type: 'group', title, scope: 'group', details: { ...g.details, kind: fd.get('kind'), members: keep } });
      if (!rec) { closeSheet(); go('group/' + saved.id); return false; }
    },
    { del: rec && rec.owner === USER.id ? () => removeIds([...childrenOf(rec.id), rec.id]).then(() => go('split', true)) : null, delMsg: 'Delete this group and all its expenses?' });
}
function pickGroup() {
  const gs = V('group');
  if (!gs.length) return groupForm();
  if (gs.length === 1) return groupExpenseForm(gs[0].id);
  openSheet('Split a bill in…', `<div class="list" style="box-shadow:none;border:1px solid var(--line)">${gs.map(g => `<button type="button" class="item" data-g="${g.id}"><div class="ico" style="background:${colorFor(g.title)}">${g.details.kind === 'family' ? '👪' : '🤝'}</div><div class="main"><div class="ttl">${esc(g.title)}</div><div class="sub">${g.details.members.length} members</div></div></button>`).join('')}</div>`,
    () => false, { submit: 'Cancel', onOpen: f => { $$('[data-g]', f).forEach(b => b.addEventListener('click', () => groupExpenseForm(b.dataset.g))); $('#sheet-ok', f).type = 'button'; $('#sheet-ok', f).onclick = closeSheet; } });
}
function groupExpenseForm(gid, rec) {
  const g = byId(gid), mem = g.details.members, me = myMember(g);
  const e = rec || { date: today(), category: 'Food & Dining', details: { payers: [{ m: (me || mem[0]).id, amount: 0 }], splitMethod: 'equal', splits: mem.map(m => ({ m: m.id, share: 0, units: 1 })) } };
  const sp = Object.fromEntries((e.details.splits || []).map(s => [s.m, s]));
  const multi = (e.details.payers || []).length > 1;
  const valOf = m => { const s = sp[m.id]; if (!s) return e.details.splitMethod === 'shares' ? 0 : ''; return e.details.splitMethod === 'shares' ? (s.units ?? 1) : e.details.splitMethod === 'percent' ? (s.pct ?? '') : e.details.splitMethod === 'exact' ? fromPaise(s.share) : ''; };
  openSheet(rec ? 'Edit group expense' : `Add expense · ${g.title}`, `
    ${amountFld('Total bill', e.amount)}
    <div class="row2">${fld('Description', `<input name="title" value="${esc(e.title)}" placeholder="e.g. Dinner">`)}${fld('Date', `<input type="date" name="date" value="${esc(e.date)}">`)}</div>
    ${fld('Category', `<select name="category">${SET.details.expenseCategories.map(c => opt(c, catIcon(c) + ' ' + c, e.category)).join('')}</select>`)}
    ${fld('Paid by', `<select name="payer">${mem.map(m => opt(m.id, m.userId === USER.id ? `${m.name} (you)` : m.name, multi ? '' : e.details.payers[0]?.m)).join('')}${opt('multi', '👥 Multiple people', multi ? 'multi' : '')}</select>`)}
    <div id="payers" style="display:${multi ? 'block' : 'none'};margin:-.3rem 0 .9rem">${mem.map(m => { const p = (e.details.payers || []).find(x => x.m === m.id); return `<div class="split-row"><label><span>${esc(m.name)} paid</span></label><input class="v" name="pay_${m.id}" inputmode="decimal" placeholder="0" value="${esc(multi && p ? fromPaise(p.amount) : '')}"></div>`; }).join('')}<p class="hint" id="pay-hint" style="margin:.4rem 0 0"></p></div>
    ${fld('Split', `<select name="method">${opt('equal', 'Equally', e.details.splitMethod)}${opt('shares', 'By shares (e.g. 2 shares for a couple)', e.details.splitMethod)}${opt('exact', 'By exact amounts', e.details.splitMethod)}${opt('percent', 'By percentage', e.details.splitMethod)}</select>`)}
    <div id="splits">${mem.map(m => `<div class="split-row"><label><input type="checkbox" name="on" value="${m.id}" ${!rec || sp[m.id] ? 'checked' : ''}><span>${esc(m.userId === USER.id ? m.name + ' (you)' : m.name)}</span></label>
      <span class="stepper" data-for="${m.id}"><button type="button" data-d="-1">−</button><input class="v" data-v="${m.id}" inputmode="decimal" value="${esc(valOf(m))}"><button type="button" data-d="1">+</button></span>
      <span class="calc" data-c="${m.id}"></span></div>`).join('')}</div>
    <p class="hint" id="split-hint" style="margin-top:.6rem"></p>
    ${fld('Notes', `<input name="notes" value="${esc(e.details.notes)}" placeholder="Optional">`)}`,
    async (fd, f) => {
      const amount = needAmount(fd.get('amount'));
      const method = fd.get('method'), on = new Set(fd.getAll('on'));
      const splits = computeSplits(amount, method, mem.map(m => ({ m: m.id, on: on.has(m.id), value: $(`[data-v="${m.id}"]`, f).value })));
      let payers;
      if (fd.get('payer') === 'multi') {
        payers = mem.map(m => ({ m: m.id, amount: toPaise(fd.get('pay_' + m.id)) || 0 })).filter(p => p.amount > 0);
        const tp = sum(payers, p => p.amount);
        if (tp !== amount) throw new Error(`Payers add up to ${money(tp)} but the bill is ${money(amount)}.`);
      } else payers = [{ m: fd.get('payer'), amount }];
      await save({ ...e, id: e.id || uid('expense'), type: 'expense', groupId: gid, scope: 'group', amount, title: fd.get('title').trim() || 'Expense', category: fd.get('category'), date: fd.get('date') || today(), status: 'done',
        details: { ...e.details, payers, splitMethod: method, splits, notes: fd.get('notes').trim() } });
      toast('Expense added to ' + g.title);
      if (route().view !== 'group') { closeSheet(); go('group/' + gid); return false; }
    },
    { del: rec ? () => removeIds([rec.id]) : null,
      onOpen: f => {
        const upd = () => {
          const method = f.method.value, amount = toPaise(f.amount.value) || 0;
          const on = new Set($$('[name=on]:checked', f).map(x => x.value));
          $('#payers', f).style.display = f.payer.value === 'multi' ? 'block' : 'none';
          if (f.payer.value === 'multi') { const tp = sum(mem, m => toPaise(f['pay_' + m.id].value) || 0); $('#pay-hint', f).textContent = `Paid ${money(tp)} of ${money(amount)}${tp !== amount ? ' · ' + money(amount - tp) + ' left' : ' ✓'}`; }
          $$('.stepper', f).forEach(s => { const id = s.dataset.for; s.style.display = method === 'equal' || !on.has(id) ? 'none' : 'flex'; $$('button', s).forEach(b => b.style.display = method === 'shares' ? '' : 'none'); });
          let preview = [];
          try { preview = computeSplits(amount || 1, method, mem.map(m => ({ m: m.id, on: on.has(m.id), value: $(`[data-v="${m.id}"]`, f).value }))); $('#split-hint', f).textContent = ''; }
          catch (err) { $('#split-hint', f).textContent = amount ? err.message : ''; }
          $$('[data-c]', f).forEach(c => { const p = preview.find(x => x.m === c.dataset.c); c.textContent = amount && p ? money(p.share) : ''; });
          if (method === 'shares') { const tot = sum(mem.filter(m => on.has(m.id)), m => Number($(`[data-v="${m.id}"]`, f).value) || 0); if (tot) $('#split-hint', f).textContent = `${tot} shares in total · 1 share = ${money(Math.round(amount / tot))}`; }
        };
        f.method.addEventListener('change', () => {
          const m = f.method.value;
          mem.forEach(x => { const inp = $(`[data-v="${x.id}"]`, f); inp.value = m === 'shares' ? 1 : m === 'percent' ? (Math.round(10000 / mem.length) / 100) : ''; });
          upd();
        });
        $$('.stepper button', f).forEach(b => b.addEventListener('click', () => { const inp = b.parentNode.querySelector('input'); inp.value = Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.d)); upd(); }));
        f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
      } });
}
function settleForm(gid, rec, pre = {}) {
  const g = byId(gid), mem = g.details.members, me = myMember(g);
  const s = rec || { date: today(), amount: pre.a ? Number(pre.a) : null, details: { from: pre.from || mem.find(m => m.id !== me?.id)?.id, to: pre.to || me?.id, mode: 'UPI' } };
  openSheet(rec ? 'Edit settle-up' : 'Settle up', `
    <div class="row2">${fld('Who paid', `<select name="from">${mem.map(m => opt(m.id, m.name, s.details.from)).join('')}</select>`)}${fld('Paid to', `<select name="to">${mem.map(m => opt(m.id, m.name, s.details.to)).join('')}</select>`)}</div>
    ${amountFld('Amount', s.amount)}<p class="hint">Partial payments are fine — the balance updates automatically.</p>
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${esc(s.date)}">`)}${fld('Mode', `<select name="mode">${SET.details.paymentModes.map(m => opt(m, m, s.details.mode)).join('')}</select>`)}</div>`,
    async fd => {
      const amount = needAmount(fd.get('amount'));
      if (fd.get('from') === fd.get('to')) throw new Error('Payer and receiver must be different.');
      await save({ ...s, id: s.id || uid('settlement'), type: 'settlement', groupId: gid, scope: 'group', amount, title: 'Settle-up', date: fd.get('date') || today(), status: 'done', details: { ...s.details, from: fd.get('from'), to: fd.get('to'), mode: fd.get('mode') } });
      toast('Settle-up recorded');
    }, { del: rec ? () => removeIds([rec.id]) : null, noFocus: true });
}

/* ---------- recurring payments ---------- */
function billForm(rec) {
  const r = rec || { scope: 'personal', category: 'Bills & Utilities', date: today(), status: 'active', details: { freq: 'monthly', every: 30, remindDays: 2, mode: 'UPI' } };
  openSheet(rec ? 'Edit recurring payment' : 'New recurring payment', `
    ${fld('Name', `<input name="title" value="${esc(r.title)}" placeholder="e.g. House rent, Car EMI, LIC premium" required>`)}
    ${amountFld('Usual amount (optional)', r.amount, 'amount', 'Leave blank if it varies')}
    <p class="hint">You can always change the amount each time you pay.</p>
    <div class="row2">${fld('Repeats', `<select name="freq">${Object.entries(FREQ).map(([k, v]) => opt(k, v, r.details.freq)).join('')}</select>`)}${fld('Every N days', `<input name="every" type="number" min="1" value="${esc(r.details.every || 30)}">`, 'every-f')}</div>
    <div class="row2">${fld('Next due date', `<input type="date" name="date" value="${esc(r.date)}">`)}${fld('Email reminder', `<select name="remindDays">${[0, 1, 2, 3, 5, 7].map(d => opt(d, d ? `${d} day${d > 1 ? 's' : ''} before` : 'On due date', r.details.remindDays)).join('')}</select>`)}</div>
    <div class="row2">${fld('Category', `<select name="category">${SET.details.expenseCategories.map(c => opt(c, catIcon(c) + ' ' + c, r.category)).join('')}</select>`)}${scopeSel(r.scope)}</div>
    ${modeSel(r.details.mode, r.details.cardId)}
    <div class="row2">${fld('Ends on (optional)', `<input type="date" name="endDate" value="${esc(r.details.endDate || '')}">`)}${fld('Status', `<select name="status">${opt('active', 'Active', r.status)}${opt('paused', 'Paused', r.status)}</select>`)}</div>`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a name.');
      const amt = fd.get('amount') ? toPaise(fd.get('amount')) : null;
      if (amt !== null && !(amt > 0)) throw new Error('Amount is not valid.');
      const pm = readMode(fd), date = fd.get('date') || today();
      await save({ ...r, id: r.id || uid('recurring'), type: 'recurring', title, amount: amt, date, category: fd.get('category'), scope: fd.get('scope'), status: fd.get('status'),
        details: { ...r.details, freq: fd.get('freq'), every: Number(fd.get('every')) || 30, anchorDay: parseD(date).getDate(), remindDays: Number(fd.get('remindDays')), mode: pm.mode, cardId: pm.cardId, endDate: fd.get('endDate') || null } });
      toast('Recurring payment saved');
    },
    { del: rec ? () => removeIds([rec.id]).then(() => go('plan', true)) : null, delMsg: 'Delete this recurring payment? (Past payments stay in your transactions.)',
      onOpen: f => { const s = () => $('.every-f', f).style.display = f.freq.value === 'days' ? '' : 'none'; f.freq.addEventListener('change', s); s(); } });
}
function payBillForm(r) {
  openSheet(`Pay ${r.title}`, `<p class="hint">Due ${fmtDateLong(r.date)}. Change the amount if this time is different.</p>
    ${amountFld('Amount paid', r.amount, 'amount', 'Enter amount')}
    <div class="row2">${fld('Paid on', `<input type="date" name="date" value="${today()}">`)}${modeSel(r.details.mode, r.details.cardId)}</div>
    <label class="toggle-row"><input type="checkbox" name="updateDefault"> Use this as the usual amount from now on</label>
    ${fld('Note', `<input name="notes" placeholder="Optional">`)}`,
    async fd => {
      const amount = needAmount(fd.get('amount')), pm = readMode(fd);
      await save({ id: uid('expense'), type: 'expense', title: r.title, amount, date: fd.get('date') || today(), category: r.category, scope: r.scope, status: 'done',
        details: { mode: pm.mode, cardId: pm.cardId, paidBy: USER.id, recurringId: r.id, notes: fd.get('notes').trim(), forDue: r.date } });
      advanceBill(r, fd.get('updateDefault') ? amount : null);
      await save(r);
      toast(`Paid · next due ${fmtDate(r.date)}`);
    }, { submit: 'Record payment' });
}
function advanceBill(r, newAmount) {
  let n = nextAfter(r.date, r.details);
  if (newAmount) r.amount = newAmount;
  r.details.lastPaid = today();
  r.date = n;
  if (r.details.endDate && n > r.details.endDate) r.status = 'ended';
}

/* ---------- credit cards ---------- */
function cardForm(rec) {
  const c = rec || { scope: 'personal', details: { billDay: 15, dueDay: 5, style: V('card').length, network: 'Visa' } };
  openSheet(rec ? 'Edit card' : 'Add credit card', `
    <div class="row2">${fld('Card name', `<input name="title" value="${esc(c.title)}" placeholder="e.g. HDFC Millennia" required>`)}${fld('Bank', `<input name="bank" value="${esc(c.details.bank)}" placeholder="HDFC">`)}</div>
    <div class="row2">${fld('Last 4 digits only', `<input name="last4" inputmode="numeric" maxlength="4" value="${esc(c.details.last4)}" placeholder="1234">`)}${fld('Network', `<select name="network">${['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners', 'Other'].map(n => opt(n, n, c.details.network)).join('')}</select>`)}</div>
    <p class="hint">🔒 Never store the full card number, CVV or PIN anywhere.</p>
    ${fld('Credit limit', `<input name="limit" inputmode="decimal" value="${esc(fromPaise(c.details.limit))}">`)}
    <div class="row2">${fld('Statement day (1-31)', `<input name="billDay" type="number" min="1" max="31" value="${esc(c.details.billDay)}">`)}${fld('Payment due day (1-31)', `<input name="dueDay" type="number" min="1" max="31" value="${esc(c.details.dueDay)}">`)}</div>
    ${!rec ? fld('Current outstanding (already spent before adding)', `<input name="opening" inputmode="decimal" placeholder="0">`) : ''}
    <div class="row2">${scopeSel(c.scope)}${fld('Card colour', `<select name="style">${['Graphite', 'Purple', 'Blue', 'Green', 'Sunset', 'Gold'].map((n, i) => opt(i, n, c.details.style)).join('')}</select>`)}</div>`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a card name.');
      const last4 = fd.get('last4').trim(); if (last4 && !/^\d{4}$/.test(last4)) throw new Error('Enter exactly the last 4 digits.');
      const bd = Number(fd.get('billDay')), dd = Number(fd.get('dueDay'));
      if (!(bd >= 1 && bd <= 31 && dd >= 1 && dd <= 31)) throw new Error('Days must be between 1 and 31.');
      await save({ ...c, id: c.id || uid('card'), type: 'card', title, scope: fd.get('scope'), details: { ...c.details, bank: fd.get('bank').trim(), last4, network: fd.get('network'), limit: toPaise(fd.get('limit')) || 0, billDay: bd, dueDay: dd, style: Number(fd.get('style')), opening: rec ? c.details.opening : (toPaise(fd.get('opening')) || 0) } });
      toast('Card saved');
    }, { del: rec ? () => removeIds([...R.filter(r => r.type === 'cardpay' && r.parentId === rec.id).map(r => r.id), rec.id]).then(() => go('plan', true)) : null, delMsg: 'Delete this card? (Expenses stay; bill payments are removed.)' });
}
function payCardForm(c, rec) {
  const s = cardStatus(c);
  const p = rec || { date: today(), amount: s.due || s.outstanding, details: { mode: 'Bank transfer' } };
  openSheet(rec ? 'Edit bill payment' : `Pay ${c.title}`, `${!rec ? `<div class="chips-row" style="margin:-.4rem 0 1rem">${s.due ? `<button type="button" class="chip exp" data-fill="${s.due}">Due ${money(s.due)}</button>` : ''}<button type="button" class="chip" data-fill="${s.outstanding}">Total ${money(s.outstanding)}</button></div>` : ''}
    ${amountFld('Amount paid', p.amount)}
    <div class="row2">${fld('Paid on', `<input type="date" name="date" value="${esc(p.date)}">`)}${fld('From', `<select name="mode">${SET.details.paymentModes.filter(m => m !== 'Credit card').map(m => opt(m, m, p.details.mode)).join('')}</select>`)}</div>
    <p class="hint">Card bill payments are not counted as spending again — the purchases already were.</p>`,
    async fd => {
      const amount = needAmount(fd.get('amount'));
      await save({ ...p, id: p.id || uid('cardpay'), type: 'cardpay', parentId: c.id, scope: c.scope, amount, title: 'Card bill payment', date: fd.get('date') || today(), status: 'done', details: { ...p.details, mode: fd.get('mode') } });
      toast('Bill payment recorded');
    }, { del: rec ? () => removeIds([rec.id]) : null, noFocus: true, onOpen: f => $$('[data-fill]', f).forEach(b => b.addEventListener('click', () => { f.amount.value = fromPaise(Number(b.dataset.fill)); })) });
}

/* ---------- RD / chits ---------- */
function schemeForm(rec) {
  const s = rec || { scope: 'personal', status: 'active', details: { kind: 'rd', startDate: today(), tenure: 12, dueDay: new Date().getDate() } };
  openSheet(rec ? 'Edit savings plan' : 'New RD / chit / savings plan', `
    ${fld('Type', `<select name="kind">${Object.entries(SCHEME_KIND).map(([k, v]) => opt(k, v, s.details.kind)).join('')}</select>`)}
    <div class="row2">${fld('Name', `<input name="title" value="${esc(s.title)}" placeholder="e.g. SBI RD, Sri Ram chit" required>`)}${fld('Bank / organiser', `<input name="bank" value="${esc(s.details.bank || s.details.organizer)}">`)}</div>
    <div class="row2">${fld('Monthly installment', `<input name="installment" inputmode="decimal" value="${esc(fromPaise(s.details.installment))}">`)}${fld('Tenure (months)', `<input name="tenure" type="number" min="1" value="${esc(s.details.tenure)}">`)}</div>
    <div class="row2">${fld('Start date', `<input type="date" name="startDate" value="${esc(s.details.startDate)}">`)}${fld('Due day each month', `<input name="dueDay" type="number" min="1" max="31" value="${esc(s.details.dueDay)}">`)}</div>
    <div data-k="rd">${fld('Interest rate (% per year)', `<input name="rate" inputmode="decimal" value="${esc(s.details.rate || '')}" placeholder="e.g. 6.8">`)}</div>
    <div data-k="chit"><div class="row2">${fld('Chit value', `<input name="chitValue" inputmode="decimal" value="${esc(fromPaise(s.details.chitValue))}" placeholder="e.g. 200000">`)}${fld('Members', `<input name="members" type="number" min="2" value="${esc(s.details.members || '')}">`)}</div>
      <label class="toggle-row"><input type="checkbox" name="prizeTaken" ${s.details.prizeTaken ? 'checked' : ''}> I have taken the prize (auction)</label>
      ${fld('Prize taken in month #', `<input name="prizeMonth" type="number" min="1" value="${esc(s.details.prizeMonth || '')}">`)}</div>
    <div class="row2">${scopeSel(s.scope)}${fld('Status', `<select name="status">${opt('active', 'Active', s.status)}${opt('closed', 'Closed / matured', s.status)}</select>`)}</div>
    ${!rec ? fld('Installments already paid before today', `<input name="already" type="number" min="0" value="0">`) : ''}`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a name.');
      const inst = toPaise(fd.get('installment')); if (!(inst > 0)) throw new Error('Enter the monthly installment.');
      const tenure = Number(fd.get('tenure')); if (!(tenure >= 1)) throw new Error('Enter the tenure in months.');
      const saved = await save({ ...s, id: s.id || uid('scheme'), type: 'scheme', title, scope: fd.get('scope'), status: fd.get('status'), amount: inst,
        details: { ...s.details, kind: fd.get('kind'), bank: fd.get('bank').trim(), installment: inst, tenure, startDate: fd.get('startDate') || today(), dueDay: Number(fd.get('dueDay')) || 1,
          rate: Number(fd.get('rate')) || 0, chitValue: toPaise(fd.get('chitValue')) || 0, members: Number(fd.get('members')) || 0, prizeTaken: !!fd.get('prizeTaken'), prizeMonth: Number(fd.get('prizeMonth')) || null } });
      const already = Math.min(tenure, Number(fd.get('already')) || 0);
      for (let i = 0; i < already; i++) await save({ id: uid('installment'), type: 'installment', parentId: saved.id, scope: saved.scope, amount: inst, title: 'Installment', date: [addMonths(saved.details.startDate, i, saved.details.dueDay), today()].sort()[0], status: 'done', details: { no: i + 1, direction: 'out', note: 'Paid earlier' } });
      if (!rec) { closeSheet(); go('scheme/' + saved.id); return false; }
    },
    { del: rec ? () => removeIds([...childrenOf(rec.id), rec.id]).then(() => go('plan', true)) : null, delMsg: 'Delete this plan and all its installments?',
      onOpen: f => { const s2 = () => { $('[data-k=rd]', f).style.display = f.kind.value === 'rd' ? '' : 'none'; $('[data-k=chit]', f).style.display = f.kind.value === 'chit' ? '' : 'none'; }; f.kind.addEventListener('change', s2); s2(); } });
}
function instForm(s, rec, direction = 'out') {
  const st = schemeStatus(s), chit = s.details.kind === 'chit';
  const x = rec || { date: today(), amount: direction === 'out' ? s.details.installment : null, details: { no: st.count + 1, direction, dividend: 0 } };
  const inn = x.details.direction === 'in';
  openSheet(rec ? 'Edit entry' : inn ? (chit ? 'Prize / payout received' : 'Maturity / withdrawal') : `Installment ${x.details.no}`, `
    ${amountFld(inn ? 'Amount received' : 'Amount paid', x.amount)}
    ${!inn && chit ? `${fld('Dividend this month (optional)', `<input name="dividend" inputmode="decimal" value="${esc(fromPaise(x.details.dividend || ''))}">`)}<p class="hint">Enter what you actually paid after the dividend discount.</p>` : ''}
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${esc(x.date)}">`)}${fld(inn ? 'What is it?' : 'Note', `<input name="note" value="${esc(x.details.note || '')}" placeholder="${inn ? (chit ? 'Prize money' : 'Maturity amount') : 'Optional'}">`)}</div>
    ${inn && chit && !rec ? '<label class="toggle-row"><input type="checkbox" name="prize" checked> This is my chit prize (mark prize as taken)</label>' : ''}`,
    async fd => {
      const amount = needAmount(fd.get('amount'));
      await save({ ...x, id: x.id || uid('installment'), type: 'installment', parentId: s.id, scope: s.scope, amount, title: inn ? 'Received' : 'Installment', date: fd.get('date') || today(), status: 'done',
        details: { ...x.details, dividend: toPaise(fd.get('dividend')) || 0, note: (fd.get('note') || '').trim() } });
      if (fd.get('prize')) { s.details.prizeTaken = true; s.details.prizeMonth = s.details.prizeMonth || st.count; await save(s); }
      if (!inn && st.pending - 1 <= 0 && !rec) toast('All installments paid 🎉'); else toast('Saved');
    }, { del: rec ? () => removeIds([rec.id]) : null });
}

/* ---------- big purchases ---------- */
function goalForm(rec) {
  const g = rec || { scope: 'personal', details: { priority: 'medium', status: 'saving', emoji: '🎯' } };
  const emojis = ['🚗', '🏍️', '📱', '💻', '📺', '🛋️', '❄️', '🏠', '✈️', '💍', '🎓', '🎯'];
  openSheet(rec ? 'Edit big purchase' : 'Plan a big purchase', `
    <div class="theme-dots">${emojis.map(e => `<label style="cursor:pointer"><input type="radio" name="emoji" value="${e}" ${g.details.emoji === e ? 'checked' : ''} style="display:none"><span class="ico soft" style="background:var(--bg2);font-size:1.4rem">${e}</span></label>`).join('')}</div>
    ${fld('What do you want to buy?', `<input name="title" value="${esc(g.title)}" placeholder="e.g. New car, iPhone, Sofa" required>`)}
    <div class="row2">${fld('Target amount', `<input name="amount" inputmode="decimal" value="${esc(fromPaise(g.amount))}">`)}${fld('Target date', `<input type="date" name="date" value="${esc(g.date || '')}">`)}</div>
    <div class="row2">${fld('Priority', `<select name="priority">${Object.entries(PRIORITY).map(([k, v]) => opt(k, v, g.details.priority)).join('')}</select>`)}${scopeSel(g.scope)}</div>
    ${rec ? fld('Status', `<select name="status">${opt('saving', 'Saving', g.details.status)}${opt('bought', 'Bought', g.details.status)}${opt('dropped', 'Dropped', g.details.status)}</select>`) : ''}
    ${fld('Notes (models, shops, quotes…)', `<textarea name="notes">${esc(g.details.notes)}</textarea>`)}`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter what you want to buy.');
      const amount = needAmount(fd.get('amount'));
      const saved = await save({ ...g, id: g.id || uid('goal'), type: 'goal', title, amount, date: fd.get('date') || null, scope: fd.get('scope'),
        details: { ...g.details, emoji: fd.get('emoji') || g.details.emoji, priority: fd.get('priority'), status: fd.get('status') || g.details.status, notes: fd.get('notes').trim() } });
      if (!rec) { closeSheet(); go('goal/' + saved.id); return false; }
    }, { del: rec ? () => removeIds([...childrenOf(rec.id), rec.id]).then(() => go('plan', true)) : null });
}
function goalSaveForm(g, rec) {
  const x = rec || { date: today(), details: { direction: 'out' } };
  openSheet(rec ? 'Edit entry' : `Save for ${g.title}`, `
    <div class="type-toggle"><button type="button" class="inc ${x.details.direction !== 'in' ? 'on' : ''}" data-d="out">${I.income} Add savings</button><button type="button" class="exp ${x.details.direction === 'in' ? 'on' : ''}" data-d="in">${I.expense} Withdraw</button></div>
    <input type="hidden" name="direction" value="${x.details.direction === 'in' ? 'in' : 'out'}">
    ${amountFld('Amount', x.amount)}
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${esc(x.date)}">`)}${fld('Note', `<input name="note" value="${esc(x.details.note || '')}">`)}</div>`,
    async fd => {
      const amount = needAmount(fd.get('amount'));
      await save({ ...x, id: x.id || uid('goalsave'), type: 'goalsave', parentId: g.id, scope: g.scope, amount, title: 'Goal saving', date: fd.get('date') || today(), status: 'done', details: { direction: fd.get('direction'), note: fd.get('note').trim() } });
      toast('Saved');
    }, { del: rec ? () => removeIds([rec.id]) : null, onOpen: f => $$('[data-d]', f).forEach(b => b.addEventListener('click', () => { f.direction.value = b.dataset.d; $$('[data-d]', f).forEach(y => y.classList.toggle('on', y === b)); })) });
}
function goalBoughtForm(g) {
  const s = goalStatus(g);
  openSheet(`Bought ${g.title}? 🎉`, `${amountFld('Final price', g.amount)}
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${today()}">`)}${modeSel('UPI', null)}</div>
    <label class="toggle-row"><input type="checkbox" name="record" checked> Record it as an expense (${scopeLabel(g.scope)} · Big purchase)</label>
    <p class="hint">${s.saved ? `You had saved ${money(s.saved)} for this.` : ''}</p>`,
    async fd => {
      const amount = needAmount(fd.get('amount')), pm = readMode(fd), date = fd.get('date') || today();
      if (fd.get('record')) await save({ id: uid('expense'), type: 'expense', title: g.title, amount, date, category: SET.details.expenseCategories.includes('Big purchase') ? 'Big purchase' : 'Shopping', scope: g.scope, status: 'done', details: { mode: pm.mode, cardId: pm.cardId, paidBy: USER.id, goalId: g.id } });
      g.details.status = 'bought'; g.details.boughtAmount = amount; g.details.boughtDate = date; await save(g);
      toast('Congratulations on your purchase! 🎉');
    }, { submit: 'Mark as bought' });
}

/* ---------- tasks, projects, reminders ---------- */
function taskForm(pid, rec) {
  const k = rec || { parentId: pid || null, status: 'todo', scope: pid ? byId(pid)?.scope || 'personal' : 'personal', details: { priority: 'medium', assignee: USER.id } };
  const projects = V('project', p => p.status !== 'completed' || p.id === k.parentId);
  openSheet(rec ? 'Edit task' : 'New task', `
    ${fld('Task', `<input name="title" value="${esc(k.title)}" placeholder="What needs to be done?" required>`)}
    <div class="row2">${fld('Due date', `<input type="date" name="date" value="${esc(k.date || '')}">`)}${fld('Priority', `<select name="priority">${Object.entries(PRIORITY).map(([a, b]) => opt(a, { high: '🔥 High', medium: '⭐ Medium', low: '💤 Low' }[a], k.details.priority)).join('')}</select>`)}</div>
    <div class="row2">${userSel('assignee', k.details.assignee || k.owner, 'Assigned to')}${fld('Status', `<select name="status">${Object.entries(TASK_STATUS).map(([a, b]) => opt(a, b, k.status)).join('')}</select>`)}</div>
    <div class="row2">${fld('Project', `<select name="parentId">${opt('', '— None —', k.parentId || '')}${projects.map(p => opt(p.id, p.title, k.parentId)).join('')}</select>`)}${scopeSel(k.scope, 'Visible to')}</div>
    ${fld('Notes / checklist', `<textarea name="notes" placeholder="- step one\n- step two">${esc(k.details.notes)}</textarea>`)}`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter the task.');
      const assignee = fd.get('assignee');
      let scope = fd.get('scope'); if (assignee !== USER.id && scope === 'personal') scope = 'family';
      await save({ ...k, id: k.id || uid('task'), type: 'task', title, date: fd.get('date') || null, status: fd.get('status'), parentId: fd.get('parentId') || null, scope,
        details: { ...k.details, priority: fd.get('priority'), assignee, notes: fd.get('notes').trim() } });
      toast(assignee !== USER.id ? `Task assigned to ${userName(assignee)}` : 'Task saved');
    }, { del: rec ? () => removeIds([rec.id]) : null });
}
function projectForm(rec) {
  const p = rec || { status: 'not_started', scope: 'family', details: {} };
  openSheet(rec ? 'Edit project' : 'New project', `
    ${fld('Project name', `<input name="title" value="${esc(p.title)}" required>`)}
    ${fld('Description', `<textarea name="description">${esc(p.details.description)}</textarea>`)}
    <div class="row2">${fld('Status', `<select name="status">${Object.entries(PROJ_STATUS).map(([a, b]) => opt(a, b, p.status)).join('')}</select>`)}${fld('Target date', `<input type="date" name="date" value="${esc(p.date || '')}">`)}</div>
    ${scopeSel(p.scope, 'Visible to')}`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a project name.');
      const saved = await save({ ...p, id: p.id || uid('project'), type: 'project', title, status: fd.get('status'), date: fd.get('date') || null, scope: fd.get('scope'), details: { ...p.details, description: fd.get('description').trim() } });
      if (!rec) { closeSheet(); go('project/' + saved.id); return false; }
    }, { del: rec ? () => removeIds([...childrenOf(rec.id), rec.id]).then(() => go('tasks', true)) : null, delMsg: 'Delete this project and its tasks?' });
}
function reminderForm(rec) {
  const r = rec || { date: today(), status: 'pending', scope: 'personal', details: { time: '09:00', repeat: 'none', before: 0, forUser: USER.id } };
  openSheet(rec ? 'Edit reminder' : 'New reminder', `
    ${fld('Remind me to…', `<input name="title" value="${esc(r.title)}" placeholder="e.g. Pay school fees" required>`)}
    <div class="row2">${fld('Date', `<input type="date" name="date" value="${esc(r.date)}">`)}${fld('Time', `<input type="time" name="time" value="${esc(r.details.time)}">`)}</div>
    <div class="row2">${fld('Repeat', `<select name="repeat">${Object.entries(REPEAT).map(([k, v]) => opt(k, v, r.details.repeat)).join('')}</select>`)}${fld('Alert', `<select name="before">${Object.entries(BEFORE).map(([k, v]) => opt(k, v, r.details.before)).join('')}</select>`)}</div>
    <div class="row2">${userSel('forUser', r.details.forUser || r.owner, 'For')}${fld('Amount (optional)', `<input name="amount" inputmode="decimal" value="${esc(fromPaise(r.amount))}">`)}</div>
    ${fld('Notes', `<textarea name="notes">${esc(r.details.notes)}</textarea>`)}`,
    async fd => {
      const title = fd.get('title').trim(); if (!title) throw new Error('Enter a title.');
      const amt = fd.get('amount') ? toPaise(fd.get('amount')) : null;
      if (amt !== null && !(amt >= 0)) throw new Error('Amount is not valid.');
      const date = fd.get('date') || today(), forUser = fd.get('forUser');
      await save({ ...r, id: r.id || uid('reminder'), type: 'reminder', title, date, amount: amt, scope: forUser !== USER.id ? 'family' : r.scope, status: rec && rec.status === 'completed' && (rec.date !== date || rec.details.time !== fd.get('time')) ? 'pending' : r.status,
        details: { ...r.details, time: fd.get('time') || '09:00', repeat: fd.get('repeat'), before: Number(fd.get('before')), forUser, notes: fd.get('notes').trim(), anchorDay: parseD(date).getDate() } });
      toast('Reminder saved');
    }, { del: rec ? () => removeIds([rec.id]) : null,
      extra: rec ? '<button type="button" class="btn ghost" id="ics">📅 Calendar</button>' : '',
      onOpen: f => { const b = $('#ics', f); if (b) b.addEventListener('click', () => { download(rec.title.replace(/[^\w]+/g, '_') + '.ics', icsFor(rec), 'text/calendar'); toast('Open the file to add it to your phone calendar'); }); } });
}
function icsFor(r) {
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const dt = `${r.date.replace(/-/g, '')}T${(r.details.time || '09:00').replace(':', '')}00`;
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.details.repeat];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LifeManager//EN', 'BEGIN:VEVENT', `UID:${r.id}@lifemanager`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${dt}`, 'DURATION:PT15M', `SUMMARY:${e(r.title)}`, `DESCRIPTION:${e((r.amount ? money(r.amount) + ' ' : '') + (r.details.notes || ''))}`, freq ? `RRULE:FREQ=${freq}` : null,
    'BEGIN:VALARM', `TRIGGER:-PT${Number(r.details.before) || 0}M`, 'ACTION:DISPLAY', `DESCRIPTION:${e(r.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

/* ---------- users ---------- */
function userForm(rec) {
  if (!isAdmin()) return;
  const u = rec || { details: { role: 'member', active: true } };
  const self = rec && rec.id === USER.id;
  openSheet(rec ? `Edit ${rec.title}` : 'Create login', `
    <div class="row2">${fld('Name', `<input name="name" value="${esc(u.title)}" placeholder="e.g. Priya" required>`)}${fld('Username', `<input name="username" value="${esc(u.details.username)}" autocapitalize="none" ${rec ? 'disabled' : ''} placeholder="e.g. priya">`)}</div>
    ${fld('Email (for reminder emails)', `<input name="email" type="email" value="${esc(u.details.email)}">`)}
    <div class="row2">${fld('Role', `<select name="role" ${self ? 'disabled' : ''}>${opt('member', 'Member', u.details.role)}${opt('admin', 'Admin', u.details.role)}</select>`)}${fld(rec ? 'New password (optional)' : 'Password', `<input name="password" type="text" autocomplete="off" placeholder="${rec ? 'Leave blank to keep' : 'At least 4 characters'}">`)}</div>
    ${rec && !self ? `<label class="toggle-row"><input type="checkbox" name="active" ${u.details.active !== false ? 'checked' : ''}> Login enabled</label>` : ''}
    <p class="hint">Tell them their username and password. They can change the password later in Settings.</p>`,
    async fd => {
      if (!rec) { await createUser({ name: fd.get('name'), username: fd.get('username'), password: fd.get('password'), role: fd.get('role'), email: fd.get('email') }); toast('Login created'); return; }
      u.title = fd.get('name').trim() || u.title; u.details.email = fd.get('email').trim();
      if (!self) { u.details.role = fd.get('role'); u.details.active = !!fd.get('active'); }
      if (fd.get('password')) await setPassword(u, fd.get('password'));
      await save(u); toast('User updated');
    });
}
function profileForm() {
  openSheet('My profile', `${fld('Name', `<input name="name" value="${esc(USER.title)}">`)}${fld('Email (for reminders & summary)', `<input name="email" type="email" value="${esc(USER.details.email)}">`)}`,
    async fd => { USER.title = fd.get('name').trim() || USER.title; USER.details.email = fd.get('email').trim(); await save(USER); toast('Profile saved'); });
}
function passwordForm() {
  openSheet('Change password', `${fld('Current password', `<input name="old" type="password" autocomplete="current-password">`)}<div class="row2">${fld('New password', `<input name="p1" type="password" autocomplete="new-password">`)}${fld('Repeat', `<input name="p2" type="password" autocomplete="new-password">`)}</div>`,
    async fd => {
      if (await hashPassword(fd.get('old'), USER.details.salt) !== USER.details.hash) throw new Error('Current password is wrong.');
      if (fd.get('p1') !== fd.get('p2')) throw new Error('New passwords do not match.');
      await setPassword(USER, fd.get('p1')); await save(USER); toast('Password changed');
    });
}
function connectForm() {
  openSheet('Connect GitHub', `<p class="hint">Your private data repository and token (Contents, Actions, Workflows = Read and write).</p>
    ${fld('Data repository', `<input name="repo" value="${esc(CONN?.repo || '')}" placeholder="username/lifemanager-data" autocapitalize="none">`)}
    ${fld('GitHub token', `<input name="token" type="password" placeholder="github_pat_…">`)}`,
    async fd => { await connectGitHub(fd.get('repo'), fd.get('token') || CONN?.token); toast('Connected · synced'); }, { submit: 'Connect' });
}
