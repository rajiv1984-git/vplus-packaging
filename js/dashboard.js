// V-Plus website – dashboard for Super Admin, Admin and Staff
import {
  ready, A, F, appMod, auth, db, firebaseConfig, $, esc, cap, fmtDate, msg, authError,
  getSettings, loadMe, accessProblem, INTERNAL, ROLES, STATUSES, toLoginEmail, usernameOf, log, setupPasswordForm,
} from './fb.js?v=1795854704';

const STATUS_LABEL = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
const SETTINGS_INFO = {
  customerSignup: ['New customer sign-up', 'Visitors can create customer accounts on the website.'],
  customerLogin: ['Customer login', 'Customers can log in to see their quotes and details.'],
  googleLogin: ['"Continue with Google" button', 'Show Google sign-in on the login and sign-up pages.'],
  staffLogin: ['Admin & Staff login', 'Admins and Staff can log in to the dashboard. The Super Admin can always log in.'],
};

let me, settings, quotes = [], users = [], current = null;
const can = {
  manageTeam: () => ['superadmin', 'admin'].includes(me.role),
  manageAdmins: () => me.role === 'superadmin',
  assign: () => ['superadmin', 'admin'].includes(me.role),
  deleteQuote: () => ['superadmin', 'admin'].includes(me.role),
  export: () => ['superadmin', 'admin'].includes(me.role),
  customers: () => ['superadmin', 'admin'].includes(me.role),
  settings: () => me.role === 'superadmin',
  activity: () => me.role === 'superadmin',
};

if (!ready) { $('dash-loading').textContent = 'Accounts are being set up.'; }
else A.onAuthStateChanged(auth, async user => {
  if (!user) { location.href = 'login.html?next=dashboard.html'; return; }
  try {
    settings = await getSettings();
    me = await loadMe(user);
  } catch (e) { $('dash-loading').textContent = 'Could not load your account: ' + e.message; return; }
  if (!INTERNAL.includes(me.role)) { location.replace('account.html'); return; }
  const problem = accessProblem(me, settings);
  if (problem) { await A.signOut(auth); $('dash-loading').innerHTML = esc(problem) + ' <a href="login.html">Back to login</a>'; return; }
  if (!sessionStorage.getItem('vplus-logged-' + me.uid)) { sessionStorage.setItem('vplus-logged-' + me.uid, '1'); log(me, 'Logged in', ''); }
  setup(user);
});

// ======================================================================
function setup(user) {
  $('dash-loading').hidden = true; $('dash').hidden = false;
  const initials = (me.name || me.username || '?').split(/[\s.]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('me-avatar').textContent = initials;
  $('me-name').textContent = me.name || me.username;
  $('me-role').textContent = ROLES[me.role]; $('me-role').className = 'role-badge r-' + me.role;
  $('me-user').textContent = me.username ? '@' + me.username : me.email;

  // show only the tabs this role may use
  document.querySelectorAll('[data-need]').forEach(el => { el.hidden = !can[el.dataset.need](); });
  document.querySelectorAll('.dash-nav [data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  showTab(location.hash.slice(1) || 'overview');

  $('logout').onclick = async () => { await log(me, 'Logged out', ''); await A.signOut(auth); location.href = 'index.html'; };
  $('q-refresh').onclick = loadAll;
  setupQuotesUI(); setupTeamUI(); setupSettingsUI(); setupProfileUI(user);
  loadAll();
}

function showTab(tab) {
  const btn = document.querySelector(`.dash-nav [data-tab="${tab}"]`);
  if (!btn || btn.hidden) tab = 'overview';
  document.querySelectorAll('.dash-nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.panel-tab').forEach(p => p.hidden = p.id !== 'tab-' + tab);
  history.replaceState(null, '', '#' + tab);
  if (tab === 'activity') loadActivity();
  window.scrollTo({ top: 0 });
}

async function loadAll() {
  try {
    const qs = await F.getDocs(F.query(F.collection(db, 'quotes'), F.orderBy('createdAt', 'desc'), F.limit(1000)));
    quotes = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { quotes = []; $('q-body').innerHTML = `<tr><td colspan="6" class="empty">Could not load quotes: ${esc(e.message)}</td></tr>`; }
  try {
    const us = await F.getDocs(F.collection(db, 'users'));
    users = us.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) { users = []; }
  renderOverview(); renderQuotes(); renderTeam(); renderCustomers();
  $('nav-new').textContent = quotes.filter(q => q.status === 'new').length || '';
}

// ======================= OVERVIEW =======================
function renderOverview() {
  const h = new Date().getHours();
  $('ov-hello').textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${(me.name || me.username || '').split(' ')[0]}`;
  const n = s => quotes.filter(q => q.status === s).length;
  const won = n('won'), lost = n('lost');
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = quotes.filter(q => q.createdAt?.toDate && q.createdAt.toDate() >= monthStart).length;
  const mine = quotes.filter(q => q.assignedTo === me.uid && !['won', 'lost'].includes(q.status)).length;
  const cards = [
    ['Needs attention', n('new'), 'New quotes not yet contacted', 'c-red'],
    ['In progress', n('contacted') + n('quoted'), 'Contacted or quotation sent', 'c-amber'],
    ['Won', won, 'Confirmed orders', 'c-green'],
    ['Conversion', (won + lost ? Math.round(won / (won + lost) * 100) : 0) + '%', 'Won ÷ closed quotes', 'c-blue'],
    ['This month', thisMonth, 'Quotes received in ' + now.toLocaleString('en-GB', { month: 'long' }), ''],
    me.role === 'staff' ? ['Assigned to me', mine, 'Open quotes assigned to you', ''] : ['Customers', users.filter(u => u.role === 'customer').length, 'Registered customer accounts', ''],
  ];
  $('ov-cards').innerHTML = cards.map(([t, v, s, c]) => `<div class="stat-card ${c}"><span>${t}</span><b>${v}</b><small>${s}</small></div>`).join('');

  // quotes per month (last 6 months)
  const months = [...Array(6)].map((_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const counts = months.map(m => quotes.filter(q => { const d = q.createdAt?.toDate?.(); return d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); }).length);
  const max = Math.max(1, ...counts);
  $('ov-chart').innerHTML = months.map((m, i) => `<div class="bar"><i style="height:${Math.round(counts[i] / max * 100)}%"><em>${counts[i]}</em></i><span>${m.toLocaleString('en-GB', { month: 'short' })}</span></div>`).join('');

  // top products
  const prod = {}; quotes.forEach(q => { if (q.product) prod[q.product] = (prod[q.product] || 0) + 1; });
  const top = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('ov-products').innerHTML = top.length ? top.map(([p, c]) => `<li><span>${esc(p)}</span><b>${c}</b></li>`).join('') : '<li class="empty">No quotes yet.</li>';

  // recent
  const recent = (me.role === 'staff' && mine ? quotes.filter(q => q.assignedTo === me.uid) : quotes).slice(0, 6);
  $('ov-recent').innerHTML = recent.length ? recent.map(q => `
    <button type="button" class="recent" data-open="${esc(q.id)}"><div><b>${esc(q.name)}</b>${q.company ? ` · ${esc(q.company)}` : ''}<small>${esc(q.product)} ${q.quantity ? '· ' + esc(q.quantity) : ''} · ${fmtDate(q.createdAt)}</small></div><span class="badge s-${esc(q.status)}">${STATUS_LABEL[q.status] || esc(q.status)}</span></button>`).join('')
    : '<p class="empty">No quote requests yet. They will appear here as soon as customers send them from the Contact page.</p>';
  $('ov-recent').onclick = e => { const b = e.target.closest('[data-open]'); if (b) openQuote(b.dataset.open); };
}

// ======================= QUOTES =======================
function setupQuotesUI() {
  $('q-filter').onchange = renderQuotes; $('q-search').oninput = renderQuotes; $('q-assigned').onchange = renderQuotes;
  $('q-counts').onclick = e => { const b = e.target.closest('[data-st]'); if (b) { $('q-filter').value = b.dataset.st; renderQuotes(); } };
  $('q-body').onclick = e => { const r = e.target.closest('[data-open]'); if (r && !e.target.closest('a')) openQuote(r.dataset.open); };
  $('q-export').onclick = exportCSV;
  $('drawer-close').onclick = closeQuote; $('drawer-bg').onclick = closeQuote;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeQuote(); });
}

function filteredQuotes() {
  const f = $('q-filter').value, s = $('q-search').value.trim().toLowerCase(), a = $('q-assigned').value;
  return quotes.filter(q => (f === 'all' || q.status === f)
    && (a === 'all' || (a === 'me' && q.assignedTo === me.uid) || (a === 'none' && !q.assignedTo))
    && (!s || [q.name, q.company, q.email, q.phone, q.product, q.details, q.country, q.assignedName].join(' ').toLowerCase().includes(s)));
}

function renderQuotes() {
  const rows = filteredQuotes();
  $('q-counts').innerHTML = ['all', ...STATUSES].map(st => {
    const n = st === 'all' ? quotes.length : quotes.filter(q => q.status === st).length;
    return `<button type="button" class="chip${$('q-filter').value === st ? ' on' : ''}" data-st="${st}">${st === 'all' ? 'All' : STATUS_LABEL[st]} <b>${n}</b></button>`;
  }).join('');
  $('q-body').innerHTML = rows.length ? rows.map(q => `
    <tr data-open="${esc(q.id)}" class="${q.status === 'new' ? 'is-new' : ''}">
      <td data-l="Received">${fmtDate(q.createdAt)}</td>
      <td data-l="Customer"><b>${esc(q.name)}</b>${q.company ? `<br>${esc(q.company)}` : ''}${q.uid ? '<br><small class="tag">Registered</small>' : ''}</td>
      <td data-l="Contact"><a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${q.phone ? `<br>${esc(q.phone)}` : ''}</td>
      <td data-l="Request"><b>${esc(q.product)}</b>${q.quantity ? ` · ${esc(q.quantity)}` : ''}${q.notesCount ? `<br><small>💬 ${q.notesCount} note${q.notesCount > 1 ? 's' : ''}</small>` : ''}</td>
      <td data-l="Assigned">${q.assignedName ? esc(q.assignedName) : '<span class="muted">—</span>'}</td>
      <td data-l="Status"><span class="badge s-${esc(q.status)}">${STATUS_LABEL[q.status] || esc(q.status)}</span></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">No quote requests match.</td></tr>';
}

const team = () => users.filter(u => ['staff', 'admin', 'superadmin'].includes(u.role) && u.active !== false);
const digits = p => String(p || '').replace(/[^\d]/g, '');

function openQuote(id) {
  const q = quotes.find(x => x.id === id); if (!q) return;
  current = q;
  const wa = digits(q.phone);
  $('d-body').innerHTML = `
    <span class="badge s-${esc(q.status)}">${STATUS_LABEL[q.status]}</span>
    <h3>${esc(q.name)}</h3><p class="muted">${q.company ? esc(q.company) + ' · ' : ''}${fmtDate(q.createdAt)}${q.uid ? ' · Registered customer' : ''}</p>
    <div class="d-actions">
      <a class="mini" href="mailto:${esc(q.email)}?subject=${encodeURIComponent('Your quote request – V-Plus Packaging')}">✉ Email</a>
      ${q.phone ? `<a class="mini" href="tel:${esc(wa ? '+' + wa : q.phone)}">☎ Call</a>` : ''}
      ${wa ? `<a class="mini wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${q.name}, this is V-Plus Packaging about your quote request for ${q.product}.`)}">WhatsApp</a>` : ''}
    </div>
    <dl class="d-grid">
      <div><dt>Product</dt><dd>${esc(q.product)}</dd></div><div><dt>Quantity</dt><dd>${esc(q.quantity) || '—'}</dd></div>
      <div><dt>Email</dt><dd>${esc(q.email)}</dd></div><div><dt>Phone</dt><dd>${esc(q.phone) || '—'}</dd></div>
      <div><dt>Country</dt><dd>${esc(q.country) || '—'}</dd></div><div><dt>Assigned to</dt><dd>${esc(q.assignedName) || '—'}</dd></div>
    </dl>
    ${q.details ? `<h4>Details</h4><p class="d-details">${esc(q.details)}</p>` : ''}
    <div class="d-controls">
      <label>Status<select id="d-status">${STATUSES.map(s => `<option value="${s}"${s === q.status ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></label>
      ${can.assign() ? `<label>Assign to<select id="d-assign"><option value="">— Not assigned —</option>${team().map(u => `<option value="${esc(u.uid)}"${u.uid === q.assignedTo ? ' selected' : ''}>${esc(u.name || u.username)} (${ROLES[u.role]})</option>`).join('')}</select></label>` : ''}
    </div>
    <p class="form-status" id="d-status-msg"></p>
    <h4>Internal notes <small class="muted">(customers never see these)</small></h4>
    <div id="d-notes" class="notes"><p class="empty">Loading…</p></div>
    <form id="d-note-form" class="note-form"><textarea name="text" required maxlength="2000" placeholder="Add a note, e.g. 'Called – sending quotation tomorrow'"></textarea><button class="btn" type="submit">Add note</button></form>
    <h4>History</h4>
    <ol class="timeline">${[...(q.history || [])].reverse().map(h => `<li><b>${esc(h.text || STATUS_LABEL[h.status] || '')}</b><small>${esc(h.by)} · ${fmtDate(h.at)}</small></li>`).join('')}<li><b>Quote received</b><small>from the website · ${fmtDate(q.createdAt)}</small></li></ol>
    ${can.deleteQuote() ? '<button type="button" class="link-danger" id="d-delete">Delete this quote</button>' : ''}`;
  $('drawer').hidden = false; $('drawer-bg').hidden = false; document.body.classList.add('no-scroll');

  $('d-status').onchange = e => updateQuote({ status: e.target.value }, `Status → ${STATUS_LABEL[e.target.value]}`);
  if ($('d-assign')) $('d-assign').onchange = e => {
    const u = users.find(x => x.uid === e.target.value);
    updateQuote({ assignedTo: u ? u.uid : null, assignedName: u ? (u.name || u.username) : null }, u ? `Assigned to ${u.name || u.username}` : 'Unassigned');
  };
  $('d-note-form').onsubmit = addNote;
  if ($('d-delete')) $('d-delete').onclick = deleteQuote;
  loadNotes(q.id);
}

function closeQuote() { $('drawer').hidden = true; $('drawer-bg').hidden = true; document.body.classList.remove('no-scroll'); current = null; }

async function updateQuote(changes, text) {
  const q = current; if (!q) return;
  const entry = { text, by: me.name || me.username, at: new Date().toISOString(), ...(changes.status ? { status: changes.status } : {}) };
  try {
    await F.updateDoc(F.doc(db, 'quotes', q.id), { ...changes, updatedAt: F.serverTimestamp(), updatedBy: me.uid, history: F.arrayUnion(entry) });
    Object.assign(q, changes); q.history = [...(q.history || []), entry];
    log(me, 'Quote updated', `${q.name} (${q.product}): ${text}`);
    renderQuotes(); renderOverview(); openQuote(q.id);
    msg($('d-status-msg'), 'Saved.', true);
    $('nav-new').textContent = quotes.filter(x => x.status === 'new').length || '';
  } catch (e) { msg($('d-status-msg'), 'Could not save: ' + e.message); }
}

async function loadNotes(id) {
  try {
    const s = await F.getDocs(F.query(F.collection(db, 'quotes', id, 'notes'), F.orderBy('at', 'asc')));
    $('d-notes').innerHTML = s.empty ? '<p class="empty">No notes yet.</p>'
      : s.docs.map(d => { const n = d.data(); return `<div class="note"><p>${esc(n.text)}</p><small>${esc(n.byName)} · ${fmtDate(n.at)}</small></div>`; }).join('');
  } catch (e) { $('d-notes').innerHTML = `<p class="empty">Could not load notes: ${esc(e.message)}</p>`; }
}

async function addNote(e) {
  e.preventDefault();
  const q = current, t = e.target.text.value.trim(); if (!q || !t) return;
  try {
    await F.addDoc(F.collection(db, 'quotes', q.id, 'notes'), { text: t, by: me.uid, byName: me.name || me.username, at: F.serverTimestamp() });
    await F.updateDoc(F.doc(db, 'quotes', q.id), { notesCount: F.increment(1), lastNote: t.slice(0, 140), updatedAt: F.serverTimestamp(), updatedBy: me.uid });
    q.notesCount = (q.notesCount || 0) + 1; e.target.reset(); loadNotes(q.id); renderQuotes();
  } catch (err) { alert('Could not add note: ' + err.message); }
}

async function deleteQuote() {
  const q = current; if (!q) return;
  if (!confirm(`Delete the quote from ${q.name} for ${q.product}? This cannot be undone.`)) return;
  try {
    await F.deleteDoc(F.doc(db, 'quotes', q.id));
    log(me, 'Quote deleted', `${q.name} – ${q.product}`);
    quotes = quotes.filter(x => x.id !== q.id); closeQuote(); renderQuotes(); renderOverview();
  } catch (e) { alert('Could not delete: ' + e.message); }
}

function exportCSV() {
  const cols = ['Received', 'Name', 'Company', 'Email', 'Phone', 'Country', 'Product', 'Quantity', 'Details', 'Status', 'Assigned to', 'Registered'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map(cell).join(',')].concat(filteredQuotes().map(q => [fmtDate(q.createdAt), q.name, q.company, q.email, q.phone, q.country, q.product, q.quantity, q.details, STATUS_LABEL[q.status], q.assignedName || '', q.uid ? 'Yes' : 'No'].map(cell).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `vplus-quotes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  log(me, 'Exported quotes', `${lines.length - 1} rows`);
}

// ======================= TEAM =======================
function setupTeamUI() {
  if (!can.manageTeam()) return;
  if (!can.manageAdmins()) $('t-role').innerHTML = '<option value="staff">Staff</option>';
  $('t-form').onsubmit = createAccount;
  $('t-body').onclick = teamAction; $('c-body').onclick = teamAction;
  $('c-search').oninput = renderCustomers;
}

async function createAccount(e) {
  e.preventDefault();
  const f = e.target, st = $('t-status'); msg(st, '');
  const username = f.username.value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) { msg(st, 'Username: 3–30 characters, letters, numbers, dots, dashes or underscores.'); return; }
  if (f.password.value.length < 8) { msg(st, 'Password must be at least 8 characters.'); return; }
  const role = f.role.value;
  if (role === 'admin' && !can.manageAdmins()) return;
  const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating…';
  // A second, temporary Firebase connection creates the account without logging you out.
  const tmp = appMod.initializeApp(firebaseConfig, 'create-' + Date.now());
  try {
    const tAuth = A.getAuth(tmp);
    const cred = await A.createUserWithEmailAndPassword(tAuth, toLoginEmail(username), f.password.value);
    const uid = cred.user.uid;
    await A.signOut(tAuth);
    await F.setDoc(F.doc(db, 'users', uid), {
      name: f.name.value.trim(), username, email: toLoginEmail(username), company: 'V-Plus Packaging', countryCode: '', phone: '',
      role, active: true, createdAt: F.serverTimestamp(), createdBy: me.uid, createdByName: me.name || me.username,
    });
    log(me, `Created ${ROLES[role]} account`, `${f.name.value.trim()} (@${username})`);
    msg(st, `${ROLES[role]} account created. They can log in with username "${username}" and the password you set.`, true);
    f.reset(); if (!can.manageAdmins()) f.role.value = 'staff';
    loadAll();
  } catch (err) { msg(st, err.code === 'auth/email-already-in-use' ? `The username "${username}" is already taken.` : (err.code ? authError(err) : err.message)); }
  finally { btn.disabled = false; btn.textContent = 'Create account'; appMod.deleteApp(tmp).catch(() => {}); }
}

function userRow(u, kind) {
  const isMe = u.uid === me.uid, isSuperRow = u.role === 'superadmin';
  const manageable = !isMe && !isSuperRow && (can.manageAdmins() || ['staff', 'customer'].includes(u.role));
  const active = u.active !== false;
  const qn = quotes.filter(q => q.uid === u.uid).length;
  const actions = manageable ? `
      <button type="button" class="mini ${active ? 'off' : 'on'}" data-act="toggle" data-uid="${esc(u.uid)}">${active ? 'Deactivate' : 'Activate'}</button>
      ${kind === 'team' && can.manageAdmins() ? `<button type="button" class="mini" data-act="role" data-uid="${esc(u.uid)}">Make ${u.role === 'admin' ? 'Staff' : 'Admin'}</button>` : ''}` : (isMe ? '<span class="muted">You</span>' : '<span class="muted">—</span>');
  return kind === 'team' ? `
    <tr><td data-l="Name"><b>${esc(u.name)}</b><br><small>${u.username ? '@' + esc(u.username) : esc(u.email)}</small></td>
    <td data-l="Role"><span class="role-badge r-${esc(u.role)}">${ROLES[u.role]}</span></td>
    <td data-l="Status"><span class="dot ${active ? 'ok' : 'no'}"></span>${active ? 'Active' : 'Deactivated'}</td>
    <td data-l="Created by">${esc(u.createdByName || '—')}<br><small>${fmtDate(u.createdAt, false)}</small></td>
    <td data-l="Last login">${fmtDate(u.lastLogin) || '<span class="muted">Never</span>'}</td>
    <td data-l="Actions" class="acts">${actions}</td></tr>` : `
    <tr><td data-l="Customer"><b>${esc(u.name || '—')}</b><br><small>${esc(u.company || '')}</small></td>
    <td data-l="Contact"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a>${u.phone ? `<br><small>${esc((u.countryCode || '').replace(/^.*\((\+\d+)\)$/, '$1'))} ${esc(u.phone)}</small>` : ''}</td>
    <td data-l="Quotes">${qn}</td>
    <td data-l="Joined">${fmtDate(u.createdAt, false)}</td>
    <td data-l="Status"><span class="dot ${active ? 'ok' : 'no'}"></span>${active ? 'Active' : 'Deactivated'}</td>
    <td data-l="Actions" class="acts">${actions}</td></tr>`;
}

function renderTeam() {
  if (!can.manageTeam()) return;
  const order = { superadmin: 0, admin: 1, staff: 2 };
  const list = users.filter(u => ['superadmin', 'admin', 'staff'].includes(u.role)).sort((a, b) => order[a.role] - order[b.role] || (a.name || '').localeCompare(b.name || ''));
  $('t-count').textContent = `${list.filter(u => u.role === 'admin').length} admins · ${list.filter(u => u.role === 'staff').length} staff`;
  $('t-body').innerHTML = list.length ? list.map(u => userRow(u, 'team')).join('') : '<tr><td colspan="6" class="empty">No team accounts yet.</td></tr>';
}

function renderCustomers() {
  if (!can.customers()) return;
  const s = $('c-search').value.trim().toLowerCase();
  const list = users.filter(u => u.role === 'customer' && (!s || [u.name, u.email, u.company, u.phone].join(' ').toLowerCase().includes(s)))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  $('c-count').textContent = `${users.filter(u => u.role === 'customer').length} registered customers`;
  $('c-body').innerHTML = list.length ? list.map(u => userRow(u, 'cust')).join('') : '<tr><td colspan="6" class="empty">No customers found.</td></tr>';
}

async function teamAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const u = users.find(x => x.uid === b.dataset.uid); if (!u) return;
  let change, text;
  if (b.dataset.act === 'toggle') {
    const active = u.active === false;
    if (!active && !confirm(`Deactivate ${u.name || u.email}? They will no longer be able to log in.`)) return;
    change = { active }; text = `${active ? 'Activated' : 'Deactivated'} ${ROLES[u.role]} ${u.name || u.email}`;
  } else {
    const role = u.role === 'admin' ? 'staff' : 'admin';
    if (!confirm(`Change ${u.name} from ${ROLES[u.role]} to ${ROLES[role]}?`)) return;
    change = { role }; text = `Changed ${u.name} to ${ROLES[role]}`;
  }
  try {
    await F.updateDoc(F.doc(db, 'users', u.uid), { ...change, updatedAt: F.serverTimestamp() });
    Object.assign(u, change); log(me, text, u.username ? '@' + u.username : u.email);
    renderTeam(); renderCustomers();
  } catch (err) { alert('Could not update: ' + err.message); }
}

// ======================= SETTINGS (Super Admin) =======================
function setupSettingsUI() {
  if (!can.settings()) return;
  $('s-list').innerHTML = Object.entries(SETTINGS_INFO).map(([k, [t, d]]) => `
    <label class="switch-row"><div><b>${t}</b><small>${d}</small></div>
    <span class="switch"><input type="checkbox" data-set="${k}" ${settings[k] ? 'checked' : ''}><i></i></span></label>`).join('');
  $('s-list').onchange = async e => {
    const k = e.target.dataset.set; if (!k) return;
    const v = e.target.checked;
    try {
      await F.setDoc(F.doc(db, 'settings', 'auth'), { [k]: v }, { merge: true });
      settings[k] = v; log(me, 'Login setting changed', `${SETTINGS_INFO[k][0]}: ${v ? 'ON' : 'OFF'}`);
      msg($('s-status'), `${SETTINGS_INFO[k][0]} switched ${v ? 'ON' : 'OFF'}.`, true);
    } catch (err) { e.target.checked = !v; msg($('s-status'), 'Could not save: ' + err.message); }
  };
}

// ======================= ACTIVITY (Super Admin) =======================
async function loadActivity() {
  if (!can.activity()) return;
  $('a-body').innerHTML = '<tr><td colspan="4" class="empty">Loading…</td></tr>';
  try {
    const s = await F.getDocs(F.query(F.collection(db, 'logs'), F.orderBy('at', 'desc'), F.limit(300)));
    $('a-body').innerHTML = s.empty ? '<tr><td colspan="4" class="empty">No activity yet.</td></tr>' : s.docs.map(d => {
      const l = d.data();
      return `<tr><td data-l="When">${fmtDate(l.at)}</td><td data-l="Who"><b>${esc(l.byName)}</b><br><small class="role-badge r-${esc(l.role)}">${ROLES[l.role] || esc(l.role)}</small></td><td data-l="Action">${esc(l.action)}</td><td data-l="Details">${esc(l.details)}</td></tr>`;
    }).join('');
  } catch (e) { $('a-body').innerHTML = `<tr><td colspan="4" class="empty">Could not load: ${esc(e.message)}</td></tr>`; }
}

// ======================= MY PROFILE =======================
function setupProfileUI(user) {
  const f = $('pr-form');
  f.name.value = me.name || '';
  $('pr-user').textContent = me.username ? me.username : me.email;
  $('pr-role').textContent = ROLES[me.role];
  f.onsubmit = async e => {
    e.preventDefault();
    try {
      await F.updateDoc(F.doc(db, 'users', me.uid), { name: f.name.value.trim(), updatedAt: F.serverTimestamp() });
      me.name = f.name.value.trim(); $('me-name').textContent = me.name; msg($('pr-status'), 'Saved.', true);
    } catch (err) { msg($('pr-status'), 'Could not save: ' + err.message); }
  };
  setupPasswordForm(user, $('pw-form'), $('pw-status'));
}
