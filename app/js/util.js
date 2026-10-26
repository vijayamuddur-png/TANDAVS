/* LifeManager Pro — helpers, constants, icons */
'use strict';

const APP_VERSION = '4.0.0';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CUR = () => (typeof SET !== 'undefined' && SET?.details?.currency) || '₹';
const money = p => { const a = Math.abs(Math.round(p || 0)); return (p < 0 ? '−' : '') + CUR() + (a % 100 ? nf2 : nf0).format(a / 100); };
const moneyShort = p => {
  const a = Math.abs(p || 0) / 100, s = p < 0 ? '−' : '';
  if (a >= 1e7) return s + CUR() + (a / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'Cr';
  if (a >= 1e5) return s + CUR() + (a / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '') + 'L';
  if (a >= 1e3) return s + CUR() + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return s + CUR() + nf0.format(a);
};
const toPaise = v => { const s = String(v ?? '').replace(/[,\s₹]/g, ''); if (s === '') return NaN; const n = Number(s); return isFinite(n) ? Math.round(n * 100) : NaN; };
const fromPaise = p => (p == null || p === '' ? '' : String(Math.round(p) / 100));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const curMonth = () => today().slice(0, 7);
const parseD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const addMonths = (s, n, anchorDay) => {
  const d = parseD(s); const day = anchorDay || d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last)); return ymd(t);
};
const shiftMonth = (m, n) => addMonths(m + '-01', n).slice(0, 7);
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const fmtDate = s => {
  if (!s) return '';
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  const d = parseD(s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const fmtDateLong = s => s ? parseD(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtMonth = m => parseD(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const fmtMon = m => parseD(m + '-01').toLocaleDateString('en-IN', { month: 'short' });
const fmtTime = t => { if (!t) return ''; const [h, mi] = t.split(':').map(Number); return new Date(2000, 0, 1, h, mi).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };
const dueText = s => { if (!s) return ''; const n = daysBetween(today(), s); if (n === 0) return 'Due today'; if (n === 1) return 'Due tomorrow'; if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`; if (n < 7) return `In ${n} days`; return fmtDate(s); };
const uid = p => p.slice(0, 3).toUpperCase() + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const initials = s => String(s || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label ?? v)}</option>`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.className = '', 2600);
}
function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ---------- colours ---------- */
const PALETTE = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#0d9488', '#4f46e5'];
const colorFor = s => PALETTE[hashStr(s) % PALETTE.length];
const THEMES = {
  emerald: { name: 'Emerald', a: '#059669', b: '#0ea5e9' },
  ocean: { name: 'Ocean', a: '#2563eb', b: '#06b6d4' },
  sunset: { name: 'Sunset', a: '#f97316', b: '#e11d48' },
  grape: { name: 'Grape', a: '#7c3aed', b: '#db2777' },
  royal: { name: 'Royal', a: '#4338ca', b: '#a21caf' }
};
const FONT_SIZES = { s: { name: 'Small', px: 14 }, m: { name: 'Medium', px: 15.5 }, l: { name: 'Large', px: 17 }, xl: { name: 'Extra large', px: 18.5 } };

/* ---------- categories ---------- */
const CAT_ICONS = {
  'Groceries': '🛒', 'Rent': '🏠', 'Bills & Utilities': '💡', 'Food & Dining': '🍽️', 'Travel': '✈️',
  'Fuel': '⛽', 'Shopping': '🛍️', 'Health': '💊', 'Education': '🎓', 'Entertainment': '🎬',
  'Gifts': '🎁', 'EMI & Loans': '🏦', 'Insurance': '🛡️', 'Kids': '🧸', 'Personal care': '💄',
  'Household': '🧹', 'Big purchase': '📺', 'Subscriptions': '📺', 'Mobile & Internet': '📱', 'Other': '📦',
  'Salary': '💼', 'Business': '📈', 'Interest': '🏦', 'Refund': '↩️', 'Rental income': '🏢', 'Gift': '🎁',
  'Group': '🤝', 'Settlement': '🤝'
};
const catIcon = c => CAT_ICONS[c] || '🏷️';

/* ---------- icons (inline SVG) ---------- */
const svg = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>'),
  split: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2A5 5 0 0 1 21.5 19"/>'),
  plan: svg('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6"/>'),
  tasks: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>', 2.4),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.6),
  tick: svg('<path d="M5 12l5 5 9-10"/>', 3),
  left: svg('<path d="M15 18l-6-6 6-6"/>', 2.4),
  right: svg('<path d="M9 18l6-6-6-6"/>', 2.4),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  card: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  piggy: svg('<path d="M19 9c1.5 0 2 1 2 2v2h-2l-1 3h-3v-2H9v2H6l-1.5-4.5C3 11 3 9 4 8c1-2 4-3 7-3 2 0 4 .5 5.5 1.5L19 5v4z"/><circle cx="15" cy="10" r=".5"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  budget: svg('<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
  statement: svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 11v6M14 14h6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  sync: svg('<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  whatsapp: svg('<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2z"/>'),
  lock: svg('<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  income: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 2.4),
  expense: svg('<path d="M12 5v14M5 12l7 7 7-7"/>', 2.4),
  font: svg('<path d="M4 20l6-16 6 16M6.5 14h7"/><path d="M17 20l2.5-7 2.5 7M18 18h3"/>')
};
