// V-Plus Packaging Industries Ltd — site script
// ---- Settings ----
const FOUNDED = new Date(2014, 9, 1);              // 1 October 2014 (months count from 0)
const QUOTE_TO = 'aaravgarglko@gmail.com';         // quote requests are emailed here automatically
const QUOTE_FALLBACK = 'info@vpluspackagingrwanda.com';

// Years in business = today − 1 October 2014 (full years completed)
const now = new Date();
let years = now.getFullYear() - FOUNDED.getFullYear();
if (now.getMonth() < FOUNDED.getMonth() || (now.getMonth() === FOUNDED.getMonth() && now.getDate() < FOUNDED.getDate())) years--;
document.querySelectorAll('[data-years]').forEach(el => {
  if (el.hasAttribute('data-count')) el.dataset.count = years;
  el.textContent = years;
});

document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

// Sticky header shadow
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// Mobile menu
const burger = document.getElementById('burger'), menu = document.getElementById('menu');
burger.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  burger.classList.toggle('open', open);
  nav.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', open);
});

// Highlight current page in menu
const page = location.pathname.split('/').pop() || 'index.html';
menu.querySelectorAll('a').forEach(a => { if (a.getAttribute('href') === page) a.classList.add('active'); });

// Reveal on scroll
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = (i % 4) * 80 + 'ms'; io.observe(el); });

// Count-up numbers
const cio = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target, end = +el.dataset.count, suffix = el.dataset.suffix || '';
  const t0 = performance.now();
  const step = t => {
    const p = Math.min((t - t0) / 1400, 1);
    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  cio.unobserve(el);
}), { threshold: .5 });
document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

// Quote form -> emailed automatically to QUOTE_TO (via FormSubmit.co, no server needed)
const form = document.getElementById('quote');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('form-status');
  const btn = form.querySelector('button[type=submit]');
  const show = (msg, ok) => { status.textContent = msg; status.className = 'form-status ' + (ok ? 'ok' : 'err'); };

  if (!form.checkValidity()) { form.reportValidity(); return; }
  const f = new FormData(form);
  if (f.get('_honey')) return; // spam bot

  const data = {
    'Name': f.get('name'), 'Company': f.get('company'), 'Email': f.get('email'), 'Phone': f.get('phone'),
    'Product': f.get('type'), 'Quantity': f.get('qty'), 'Details': f.get('msg'),
    _subject: `New quote request – ${f.get('company') || f.get('name')}`,
    _replyto: f.get('email'),
    _template: 'table',
  };

  btn.disabled = true; btn.textContent = 'Sending…'; show('', true);
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${QUOTE_TO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || String(out.success) !== 'true') throw new Error(out.message || res.status);
    form.reset();
    show('Thank you! Your quote request has been sent. Our team will contact you within one business day.', true);
  } catch (err) {
    show(`Sorry, your request could not be sent. Please email us at ${QUOTE_FALLBACK} or call +250 795 308 530.`, false);
  } finally {
    btn.disabled = false; btn.textContent = 'Send Request';
  }
});

// Map loads only when the visitor asks (no Google connection by default)
const mapBtn = document.getElementById('load-map');
if (mapBtn) mapBtn.addEventListener('click', () => {
  mapBtn.closest('.map').innerHTML = '<iframe title="V-Plus Packaging location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Gahanga,+Kicukiro,+Kigali,+Rwanda&output=embed"></iframe>';
});
