// V-Plus website – accounts (Firebase Authentication + Cloud Firestore)
import { firebaseConfig, STAFF_EMAILS } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const page = document.body.dataset.page || '';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const isStaffUser = u => !!u && u.emailVerified && STAFF_EMAILS.map(e => e.toLowerCase()).includes((u.email || '').toLowerCase());

function msg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'form-status ' + (text ? (ok ? 'ok' : 'err') : '');
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/email-already-in-use': 'An account with this email already exists. Please log in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/unauthorized-domain': 'This website address is not yet allowed in Firebase (Authentication → Settings → Authorized domains).',
};
const authError = e => AUTH_ERRORS[e?.code] || e?.message || 'Something went wrong. Please try again.';

// ---------- not configured yet ----------
if (!firebaseConfig.apiKey) {
  document.querySelectorAll('[data-auth-notice]').forEach(el => {
    el.hidden = false;
    el.textContent = 'Customer accounts are being set up and will be available soon. You can still request a quote on the Contact page.';
  });
  document.querySelectorAll('[data-auth-form] input, [data-auth-form] button, [data-auth-form] select').forEach(el => el.disabled = true);
  document.querySelectorAll('[data-auth-loading]').forEach(el => el.hidden = true);
} else {
  start().catch(err => console.error('Account system error:', err));
}

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const google = new A.GoogleAuthProvider();

  // Save every website quote to the database (used by main.js alongside email)
  window.vplusSaveQuote = async q => {
    const u = auth.currentUser;
    await F.addDoc(F.collection(db, 'quotes'), {
      uid: u ? u.uid : null,
      name: q.Name || '', company: q.Company || '', email: q.Email || '',
      country: q.Country || '', countryCode: q['Country code'] || '', phone: q.Phone || '',
      product: q.Product || '', quantity: q.Quantity || '', details: q.Details || '',
      status: 'new', createdAt: F.serverTimestamp(),
    });
    return { success: 'true' };
  };

  const ensureProfile = async (u, extra = {}) => {
    const ref = F.doc(db, 'users', u.uid);
    const snap = await F.getDoc(ref);
    if (!snap.exists()) {
      await F.setDoc(ref, {
        name: extra.name || u.displayName || '', company: extra.company || '', email: u.email || '',
        countryCode: extra.countryCode || 'Rwanda (+250)', phone: extra.phone || '', createdAt: F.serverTimestamp(),
      });
    }
    return (await F.getDoc(ref)).data();
  };

  const nextUrl = u => {
    const n = new URLSearchParams(location.search).get('next');
    if (n && /^[a-z]+\.html$/.test(n)) return n;
    return isStaffUser(u) ? 'staff.html' : 'account.html';
  };

  // ---------- header link ----------
  A.onAuthStateChanged(auth, async user => {
    const link = $('nav-auth');
    if (link) {
      if (user) { link.textContent = isStaffUser(user) ? 'Staff' : 'My Account'; link.href = isStaffUser(user) ? 'staff.html' : 'account.html'; }
      else { link.textContent = 'Login'; link.href = 'login.html'; }
    }
    // Pre-fill the quote form for logged-in customers
    const qf = $('quote');
    if (user && qf && !qf.dataset.filled) {
      qf.dataset.filled = '1';
      try {
        const p = (await F.getDoc(F.doc(db, 'users', user.uid))).data() || {};
        const set = (n, v) => { if (qf[n] && !qf[n].value && v) qf[n].value = v; };
        set('name', p.name || user.displayName); set('company', p.company); set('email', p.email || user.email);
        set('phone', p.phone); if (p.countryCode && qf.country_code) qf.country_code.value = p.countryCode;
      } catch (e) { /* profile not readable – ignore */ }
    }
  });

  // ---------- login page ----------
  if (page === 'login') {
    const form = $('login-form'), status = $('auth-status');
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg(status, '');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const { user } = await A.signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
        location.href = nextUrl(user);
      } catch (err) { msg(status, authError(err)); btn.disabled = false; }
    });
    $('google-btn').addEventListener('click', async () => {
      msg(status, '');
      try { const { user } = await A.signInWithPopup(auth, google); await ensureProfile(user); location.href = nextUrl(user); }
      catch (err) { msg(status, authError(err)); }
    });
    $('forgot-link').addEventListener('click', async e => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!email) { msg(status, 'Type your email address above, then click "Forgot password?" again.'); form.email.focus(); return; }
      try { await A.sendPasswordResetEmail(auth, email); msg(status, `If an account exists for ${email}, a password reset link has been sent. Check your inbox and spam folder.`, true); }
      catch (err) { msg(status, authError(err)); }
    });
    A.onAuthStateChanged(auth, u => { if (u && !form.dataset.busy) $('already').hidden = false; });
  }

  // ---------- sign-up page ----------
  if (page === 'signup') {
    const form = $('signup-form'), status = $('auth-status');
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg(status, '');
      if (form.password.value !== form.password2.value) { msg(status, 'The two passwords do not match.'); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; form.dataset.busy = '1';
      try {
        const { user } = await A.createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
        await A.updateProfile(user, { displayName: form.name.value.trim() });
        await ensureProfile(user, { name: form.name.value.trim(), company: form.company.value.trim(), countryCode: form.country_code.value, phone: form.phone.value.trim() });
        await A.sendEmailVerification(user).catch(() => {});
        location.href = 'account.html?welcome=1';
      } catch (err) { msg(status, authError(err)); btn.disabled = false; delete form.dataset.busy; }
    });
    $('google-btn').addEventListener('click', async () => {
      msg(status, '');
      try { const { user } = await A.signInWithPopup(auth, google); await ensureProfile(user); location.href = nextUrl(user); }
      catch (err) { msg(status, authError(err)); }
    });
  }

  // ---------- customer account page ----------
  if (page === 'account') {
    A.onAuthStateChanged(auth, async user => {
      if (!user) { location.href = 'login.html?next=account.html'; return; }
      $('auth-loading').hidden = true; $('account').hidden = false;
      $('acc-name').textContent = user.displayName || user.email;
      $('acc-email').textContent = user.email;
      if (new URLSearchParams(location.search).get('welcome')) $('welcome').hidden = false;
      if (isStaffUser(user)) $('staff-link').hidden = false;

      // email verification
      if (!user.emailVerified) {
        $('verify').hidden = false;
        $('verify-btn').onclick = async () => {
          try { await A.sendEmailVerification(user); $('verify-btn').textContent = 'Sent – check your inbox'; $('verify-btn').disabled = true; }
          catch (err) { alert(authError(err)); }
        };
      }

      // profile
      const pf = $('profile-form'), ps = $('profile-status');
      const p = await ensureProfile(user);
      pf.name.value = p.name || ''; pf.company.value = p.company || ''; pf.phone.value = p.phone || '';
      if (p.countryCode) pf.country_code.value = p.countryCode;
      pf.onsubmit = async e => {
        e.preventDefault(); msg(ps, '');
        try {
          await F.setDoc(F.doc(db, 'users', user.uid), {
            name: pf.name.value.trim(), company: pf.company.value.trim(), email: user.email || '',
            countryCode: pf.country_code.value, phone: pf.phone.value.trim(), updatedAt: F.serverTimestamp(),
          }, { merge: true });
          await A.updateProfile(user, { displayName: pf.name.value.trim() });
          $('acc-name').textContent = pf.name.value.trim() || user.email;
          msg(ps, 'Your details have been saved.', true);
        } catch (err) { msg(ps, 'Could not save: ' + (err.message || err)); }
      };

      // my quotes
      const list = $('my-quotes');
      try {
        const snap = await F.getDocs(F.query(F.collection(db, 'quotes'), F.where('uid', '==', user.uid)));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        list.innerHTML = rows.length ? rows.map(q => `
          <div class="q-row"><div><b>${esc(q.product)}</b>${q.quantity ? ` · ${esc(q.quantity)}` : ''}<span>${fmtDate(q.createdAt)}</span>${q.details ? `<p>${esc(q.details)}</p>` : ''}</div>
          <span class="badge s-${esc(q.status)}">${esc(cap(q.status))}</span></div>`).join('')
          : '<p class="empty">You have not sent any quote requests yet. <a href="contact.html">Request a quote →</a></p>';
      } catch (err) { list.innerHTML = '<p class="empty">Could not load your quotes.</p>'; console.error(err); }

      $('logout').onclick = async () => { await A.signOut(auth); location.href = 'index.html'; };
    });
  }

  // ---------- staff dashboard ----------
  if (page === 'staff') {
    A.onAuthStateChanged(auth, async user => {
      if (!user) { location.href = 'login.html?next=staff.html'; return; }
      $('auth-loading').hidden = true;
      $('logout').onclick = async () => { await A.signOut(auth); location.href = 'index.html'; };
      if (!isStaffUser(user)) {
        $('denied').hidden = false;
        $('denied-msg').textContent = !user.emailVerified && STAFF_EMAILS.includes((user.email || '').toLowerCase())
          ? 'Please verify your email address first (check your inbox for the verification link), then reload this page.'
          : `${user.email} is not a staff account. Staff access is limited to V-Plus staff email addresses.`;
        return;
      }
      $('staff').hidden = false;
      $('staff-email').textContent = user.email;

      let all = [];
      const tbody = $('q-body'), filter = $('q-filter'), search = $('q-search'), counts = $('q-counts');
      const render = () => {
        const f = filter.value, s = search.value.trim().toLowerCase();
        const rows = all.filter(q => (f === 'all' || q.status === f) &&
          (!s || [q.name, q.company, q.email, q.phone, q.product, q.details, q.country].join(' ').toLowerCase().includes(s)));
        counts.innerHTML = ['all', ...STATUSES].map(st => {
          const n = st === 'all' ? all.length : all.filter(q => q.status === st).length;
          return `<button type="button" class="chip${filter.value === st ? ' on' : ''}" data-st="${st}">${cap(st)} <b>${n}</b></button>`;
        }).join('');
        tbody.innerHTML = rows.length ? rows.map(q => `
          <tr>
            <td data-l="Date">${fmtDate(q.createdAt)}</td>
            <td data-l="Customer"><b>${esc(q.name)}</b>${q.company ? `<br>${esc(q.company)}` : ''}${q.uid ? '<br><small class="tag">Registered</small>' : ''}</td>
            <td data-l="Contact"><a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${q.phone ? `<br><a href="tel:${esc(q.phone.replace(/\s/g, ''))}">${esc(q.phone)}</a>` : ''}${q.country ? `<br><small>${esc(q.country)}</small>` : ''}</td>
            <td data-l="Request"><b>${esc(q.product)}</b>${q.quantity ? ` · ${esc(q.quantity)}` : ''}${q.details ? `<p>${esc(q.details)}</p>` : ''}</td>
            <td data-l="Status"><select data-id="${esc(q.id)}" class="st s-${esc(q.status)}">${STATUSES.map(st => `<option value="${st}"${st === q.status ? ' selected' : ''}>${cap(st)}</option>`).join('')}</select></td>
          </tr>`).join('') : '<tr><td colspan="5" class="empty">No quote requests found.</td></tr>';
      };
      const load = async () => {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
        try {
          const snap = await F.getDocs(F.query(F.collection(db, 'quotes'), F.orderBy('createdAt', 'desc'), F.limit(500)));
          all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          render();
        } catch (err) {
          tbody.innerHTML = `<tr><td colspan="5" class="empty">Could not load quotes: ${esc(err.message)}</td></tr>`;
        }
      };
      filter.onchange = render; search.oninput = render;
      counts.onclick = e => { const b = e.target.closest('[data-st]'); if (b) { filter.value = b.dataset.st; render(); } };
      $('q-refresh').onclick = load;
      tbody.onchange = async e => {
        const sel = e.target.closest('select[data-id]'); if (!sel) return;
        const q = all.find(x => x.id === sel.dataset.id); const prev = q.status;
        q.status = sel.value; sel.className = 'st s-' + sel.value;
        try { await F.updateDoc(F.doc(db, 'quotes', q.id), { status: q.status, updatedAt: F.serverTimestamp() }); render(); }
        catch (err) { q.status = prev; render(); alert('Could not update status: ' + err.message); }
      };
      load();
    });
  }
}

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDate(ts) {
  if (!ts || !ts.toDate) return '';
  return ts.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
