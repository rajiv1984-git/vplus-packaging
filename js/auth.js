// V-Plus website – login, sign-up, customer account, header link, quote saving
import {
  ready, A, F, auth, db, $, esc, cap, fmtDate, msg, authError, toLoginEmail, isUsernameEmail,
  getSettings, loadMe, accessProblem, homeFor, INTERNAL, setupPasswordForm,
} from './fb.js?v=1795854704';

const page = document.body.dataset.page || '';

// Contact page: "Request again" links pre-fill product & quantity
(() => {
  const qf = $('quote'); if (!qf) return;
  const p = new URLSearchParams(location.search);
  if (p.get('product') && qf.type) [...qf.type.options].forEach(o => { if (o.text === p.get('product')) qf.type.value = o.value || o.text; });
  if (p.get('qty') && qf.qty) qf.qty.value = p.get('qty');
})();

if (!ready) {
  document.querySelectorAll('[data-auth-notice]').forEach(el => { el.hidden = false; el.textContent = 'Accounts are being set up and will be available soon.'; });
} else {
  start().catch(err => console.error('Account system error:', err));
}

async function start() {
  const settings = await getSettings();
  const google = new A.GoogleAuthProvider();

  // Every website quote is also stored in the database (main.js sends the email)
  window.vplusSaveQuote = async q => {
    const u = auth.currentUser;
    await F.addDoc(F.collection(db, 'quotes'), {
      uid: u && !isUsernameEmail(u.email) ? u.uid : null,
      name: q.Name || '', company: q.Company || '', email: q.Email || '',
      country: q.Country || '', countryCode: q['Country code'] || '', phone: q.Phone || '',
      product: q.Product || '', quantity: q.Quantity || '', details: q.Details || '',
      status: 'new', createdAt: F.serverTimestamp(),
    });
    return { success: 'true' };
  };

  // Sign in → load profile → check access → go to the right home page
  const finishLogin = async (user, extra) => {
    let me;
    try { me = await loadMe(user, extra); }
    catch (e) { await A.signOut(auth); throw new Error(settings.customerSignup ? 'Could not open your account. Please try again.' : 'New customer sign-up is currently closed.'); }
    const problem = accessProblem(me, settings);
    if (problem) { await A.signOut(auth); throw new Error(problem); }
    F.updateDoc(F.doc(db, 'users', user.uid), { lastLogin: F.serverTimestamp() }).catch(() => {});
    const n = new URLSearchParams(location.search).get('next');
    location.href = n && /^[a-z]+\.html$/.test(n) && !(n === 'dashboard.html' && !INTERNAL.includes(me.role)) ? n : homeFor(me);
  };

  // ---------- header link ----------
  A.onAuthStateChanged(auth, async user => {
    const link = $('nav-auth');
    if (!user) { if (link) { link.textContent = 'Login'; link.href = 'login.html'; } return; }
    try {
      const snap = await F.getDoc(F.doc(db, 'users', user.uid));
      const me = snap.exists() ? { uid: user.uid, ...snap.data() } : null;
      if (link) {
        const internal = me && INTERNAL.includes(me.role);
        link.textContent = internal ? 'Dashboard' : 'My Account';
        link.href = internal ? 'dashboard.html' : 'account.html';
      }
      // pre-fill the quote form for logged-in customers
      const qf = $('quote');
      if (me && me.role === 'customer' && qf && !qf.dataset.filled) {
        qf.dataset.filled = '1';
        const set = (n, v) => { if (qf[n] && !qf[n].value && v) qf[n].value = v; };
        set('name', me.name); set('company', me.company); set('email', me.email); set('phone', me.phone);
        if (me.countryCode && qf.country_code) qf.country_code.value = me.countryCode;
      }
    } catch { /* ignore */ }
  });

  // ---------- login page ----------
  if (page === 'login') {
    const form = $('login-form'), status = $('auth-status');
    if (!settings.googleLogin) { $('google-btn').hidden = true; $('or-line').hidden = true; }
    if (!settings.customerSignup) $('signup-switch').hidden = true;
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg(status, '');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Logging in…';
      try {
        const { user } = await A.signInWithEmailAndPassword(auth, toLoginEmail(form.email.value), form.password.value);
        await finishLogin(user);
      } catch (err) { msg(status, err.code ? authError(err) : err.message); btn.disabled = false; btn.textContent = 'Log In'; }
    });
    $('google-btn').addEventListener('click', async () => {
      msg(status, '');
      try { const { user } = await A.signInWithPopup(auth, google); await finishLogin(user); }
      catch (err) { msg(status, err.code ? authError(err) : err.message); }
    });
    $('forgot-link').addEventListener('click', async e => {
      e.preventDefault();
      const v = form.email.value.trim();
      if (!v) { msg(status, 'Type your email address above, then click "Forgot password?" again.'); form.email.focus(); return; }
      if (!v.includes('@')) { msg(status, 'Staff and admin passwords are reset by your Admin. Please contact them.'); return; }
      try { await A.sendPasswordResetEmail(auth, v); msg(status, `If an account exists for ${v}, a reset link has been sent. Check your inbox and spam folder.`, true); }
      catch (err) { msg(status, authError(err)); }
    });
  }

  // ---------- sign-up page ----------
  if (page === 'signup') {
    const form = $('signup-form'), status = $('auth-status');
    if (!settings.customerSignup) {
      $('signup-closed').hidden = false;
      form.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
      $('google-btn').disabled = true;
    }
    if (!settings.googleLogin) { $('google-btn').hidden = true; $('or-line').hidden = true; }
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg(status, '');
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!form.email.value.includes('@') || isUsernameEmail(form.email.value)) { msg(status, 'Please use your own email address.'); return; }
      if (form.password.value !== form.password2.value) { msg(status, 'The two passwords do not match.'); return; }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating account…';
      try {
        const { user } = await A.createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
        await A.updateProfile(user, { displayName: form.name.value.trim() });
        await A.sendEmailVerification(user).catch(() => {});
        await loadMe(user, { name: form.name.value.trim(), company: form.company.value.trim(), countryCode: form.country_code.value, phone: form.phone.value.trim() });
        location.href = 'account.html?welcome=1';
      } catch (err) { msg(status, err.code ? authError(err) : err.message); btn.disabled = false; btn.textContent = 'Create Account'; }
    });
    $('google-btn').addEventListener('click', async () => {
      msg(status, '');
      try { const { user } = await A.signInWithPopup(auth, google); await finishLogin(user); }
      catch (err) { msg(status, err.code ? authError(err) : err.message); }
    });
  }

  // ---------- staff.html (old link) → dashboard ----------
  if (page === 'staff') location.replace('dashboard.html');

  // ---------- customer account ----------
  if (page === 'account') {
    A.onAuthStateChanged(auth, async user => {
      if (!user) { location.href = 'login.html?next=account.html'; return; }
      let me;
      try { me = await loadMe(user); } catch { $('auth-loading').textContent = 'Could not load your account.'; return; }
      if (INTERNAL.includes(me.role)) { location.replace('dashboard.html'); return; }
      const problem = accessProblem(me, settings);
      if (problem) { await A.signOut(auth); location.href = 'login.html'; return; }

      $('auth-loading').hidden = true; $('account').hidden = false;
      const first = (me.name || '').split(' ')[0];
      const h = new Date().getHours();
      $('acc-hello').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      $('acc-name').textContent = first || me.email;
      $('acc-email').textContent = me.email;
      $('acc-since').textContent = me.createdAt ? 'Customer since ' + fmtDate(me.createdAt, false) : '';
      if (new URLSearchParams(location.search).get('welcome')) $('welcome').hidden = false;
      if (!user.emailVerified && user.providerData.some(p => p.providerId === 'password')) {
        $('verify').hidden = false;
        $('verify-btn').onclick = async () => {
          try { await A.sendEmailVerification(user); $('verify-btn').textContent = 'Sent – check your inbox'; $('verify-btn').disabled = true; }
          catch (err) { alert(authError(err)); }
        };
      }

      // profile
      const pf = $('profile-form'), ps = $('profile-status');
      pf.name.value = me.name || ''; pf.company.value = me.company || ''; pf.phone.value = me.phone || '';
      if (me.countryCode) pf.country_code.value = me.countryCode;
      pf.onsubmit = async e => {
        e.preventDefault(); msg(ps, '');
        try {
          await F.updateDoc(F.doc(db, 'users', user.uid), {
            name: pf.name.value.trim(), company: pf.company.value.trim(), countryCode: pf.country_code.value,
            phone: pf.phone.value.trim(), updatedAt: F.serverTimestamp(),
          });
          await A.updateProfile(user, { displayName: pf.name.value.trim() });
          $('acc-name').textContent = pf.name.value.trim().split(' ')[0] || me.email;
          msg(ps, 'Your details have been saved.', true);
        } catch (err) { msg(ps, 'Could not save: ' + (err.message || err)); }
      };
      setupPasswordForm(user, $('pw-form'), $('pw-status'));

      // my quotes + stats + timeline
      const list = $('my-quotes');
      try {
        const snap = await F.getDocs(F.query(F.collection(db, 'quotes'), F.where('uid', '==', user.uid)));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        $('st-total').textContent = rows.length;
        $('st-open').textContent = rows.filter(q => ['new', 'contacted', 'quoted'].includes(q.status)).length;
        $('st-won').textContent = rows.filter(q => q.status === 'won').length;
        list.innerHTML = rows.length ? rows.map(q => {
          const step = Math.max(0, ['new', 'contacted', 'quoted', 'won'].indexOf(q.status));
          const track = q.status === 'lost' ? '<p class="closed">This request was closed. Contact us if you would like to discuss it again.</p>'
            : `<ol class="track">${['Received', 'Contacted', 'Quotation sent', 'Order confirmed'].map((t, i) => `<li class="${i <= step ? 'done' : ''}">${t}</li>`).join('')}</ol>`;
          const again = `contact.html?product=${encodeURIComponent(q.product || '')}&qty=${encodeURIComponent(q.quantity || '')}#quote`;
          return `<div class="q-card">
            <div class="q-top"><div><b>${esc(q.product)}</b>${q.quantity ? ` · ${esc(q.quantity)}` : ''}<span>${fmtDate(q.createdAt)}</span></div>
            <span class="badge s-${esc(q.status)}">${esc(cap(q.status))}</span></div>
            ${q.details ? `<p class="q-det">${esc(q.details)}</p>` : ''}${track}
            <a class="again" href="${again}">↻ Request again</a></div>`;
        }).join('') : '<p class="empty">You have not sent any quote requests yet. <a href="contact.html#quote">Request your first quote →</a></p>';
      } catch (err) { list.innerHTML = '<p class="empty">Could not load your quotes.</p>'; console.error(err); }

      $('logout').onclick = async () => { await A.signOut(auth); location.href = 'index.html'; };
    });
  }
}
