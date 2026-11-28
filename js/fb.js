// V-Plus website – shared Firebase setup and account helpers
import { firebaseConfig, USERNAME_DOMAIN, SUPER_UID } from './firebase-config.js?v=1795854704';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
export const ready = !!firebaseConfig.apiKey;
export { firebaseConfig, USERNAME_DOMAIN, SUPER_UID };

export let A, F, appMod, app, auth, db;
if (ready) {
  [appMod, A, F] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)]);
  app = appMod.initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
}

export const ROLES = { superadmin: 'Super Admin', admin: 'Admin', staff: 'Staff', customer: 'Customer' };
export const INTERNAL = ['superadmin', 'admin', 'staff'];
export const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
export function fmtDate(ts, withTime = true) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d || isNaN(d)) return '';
  return d.toLocaleString('en-GB', withTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
}
export function msg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.className = 'form-status ' + (text ? (ok ? 'ok' : 'err') : '');
}

// "admin.aarav" -> admin.aarav@accounts.vplus-website.firebaseapp.com ; emails pass through
export const toLoginEmail = v => { v = String(v || '').trim().toLowerCase(); return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`; };
export const isUsernameEmail = e => String(e || '').toLowerCase().endsWith('@' + USERNAME_DOMAIN);
export const usernameOf = e => isUsernameEmail(e) ? String(e).split('@')[0] : '';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Wrong username/email or password.',
  'auth/wrong-password': 'Wrong username/email or password.',
  'auth/user-not-found': 'No account found.',
  'auth/email-already-in-use': 'An account with this email or username already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address or username.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/requires-recent-login': 'For security, please log out and log in again, then retry.',
  'auth/unauthorized-domain': 'This website address is not allowed in Firebase (Authentication → Settings → Authorized domains).',
};
export const authError = e => AUTH_ERRORS[e?.code] || e?.message || 'Something went wrong. Please try again.';

// ---------- login switches (set by the Super Admin) ----------
export const DEFAULT_SETTINGS = { customerSignup: true, customerLogin: true, googleLogin: true, staffLogin: true };
export async function getSettings() {
  if (!ready) return { ...DEFAULT_SETTINGS };
  try { const s = await F.getDoc(F.doc(db, 'settings', 'auth')); return { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

// ---------- the signed-in person's profile ----------
export async function loadMe(user, extra = {}) {
  const ref = F.doc(db, 'users', user.uid);
  let snap = await F.getDoc(ref);
  if (!snap.exists()) {
    const isSuper = SUPER_UID && user.uid === SUPER_UID;
    const data = {
      name: extra.name || user.displayName || (isSuper ? 'Super Admin' : usernameOf(user.email) || ''),
      company: extra.company || '', email: user.email || '',
      countryCode: extra.countryCode || 'Rwanda (+250)', phone: extra.phone || '',
      role: isSuper ? 'superadmin' : 'customer', active: true,
      createdAt: F.serverTimestamp(),
    };
    if (isSuper) data.username = usernameOf(user.email);
    await F.setDoc(ref, data);
    snap = await F.getDoc(ref);
  }
  return { uid: user.uid, ...snap.data() };
}

// Returns an error message if this person may not use the site right now, otherwise ''
export function accessProblem(me, settings) {
  if (me.role === 'superadmin') return '';
  if (me.active === false) return 'Your account has been deactivated. Please contact V-Plus Packaging.';
  if (me.role === 'customer' && !settings.customerLogin) return 'Customer login is temporarily switched off. Please try again later or contact us.';
  if (INTERNAL.includes(me.role) && !settings.staffLogin) return 'Staff and admin login is temporarily switched off by the Super Admin.';
  return '';
}

export const homeFor = me => INTERNAL.includes(me.role) ? 'dashboard.html' : 'account.html';

export async function log(me, action, details = '') {
  try {
    await F.addDoc(F.collection(db, 'logs'), {
      action, details: String(details).slice(0, 500), by: me.uid, byName: me.name || me.email || '', role: me.role, at: F.serverTimestamp(),
    });
  } catch (e) { console.warn('log failed', e); }
}

// Change password (asks for the current one first)
export function setupPasswordForm(user, form, status) {
  if (!form) return;
  if (!user.providerData.some(p => p.providerId === 'password')) {
    form.innerHTML = '<h3>Password</h3><p class="empty">You sign in with Google, so your password is managed by your Google account.</p>';
    return;
  }
  form.onsubmit = async e => {
    e.preventDefault(); msg(status, '');
    if (form.newpw.value !== form.newpw2.value) { msg(status, 'The new passwords do not match.'); return; }
    try {
      await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, form.curpw.value));
      await A.updatePassword(user, form.newpw.value);
      form.reset(); msg(status, 'Your password has been changed.', true);
    } catch (err) { msg(status, authError(err)); }
  };
}
