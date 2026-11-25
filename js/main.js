// V-Plus Packaging Industries Ltd — site script
const QUOTE_EMAIL = 'info@vpluspackagingrwanda.com'; // where quote requests are sent

document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

// Sticky header shadow
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 10), { passive: true });

// Mobile menu
const burger = document.getElementById('burger'), menu = document.getElementById('menu');
burger.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  burger.classList.toggle('open', open);
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

// Quote form -> opens the visitor's email app
const form = document.getElementById('quote');
if (form) form.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(form);
  const body = `Name: ${f.get('name')}\nCompany: ${f.get('company')}\nEmail: ${f.get('email')}\nPhone: ${f.get('phone')}\nProduct: ${f.get('type')}\nQuantity: ${f.get('qty')}\n\n${f.get('msg')}`;
  location.href = `mailto:${QUOTE_EMAIL}?subject=${encodeURIComponent('Quote request – ' + (f.get('company') || f.get('name')))}&body=${encodeURIComponent(body)}`;
});

// Map loads only when the visitor asks (no Google connection by default)
const mapBtn = document.getElementById('load-map');
if (mapBtn) mapBtn.addEventListener('click', () => {
  mapBtn.closest('.map').innerHTML = '<iframe title="V-Plus Packaging location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Gahanga,+Kicukiro,+Kigali,+Rwanda&output=embed"></iframe>';
});
