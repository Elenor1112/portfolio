import { site, projects } from './data.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Render ---------------- */

function fillSite() {
  $$('[data-site]').forEach((el) => { el.textContent = site[el.dataset.site] ?? ''; });
  $('[data-about-copy]').innerHTML = site.about.map((p) => `<p data-reveal>${esc(p)}</p>`).join('');
  $('[data-about-caps]').innerHTML = site.capabilities.map((c) => `<li data-reveal>${esc(c)}</li>`).join('');
  $('[data-stats]').innerHTML = site.stats
    .map((s) => `<div data-reveal><dt>${esc(s.label)}</dt><dd data-count="${/^\d+$/.test(s.value) ? s.value : ''}">${esc(s.value)}</dd></div>`)
    .join('');
  const email = $('[data-email-link]');
  email.href = `mailto:${site.email}`;
  email.textContent = site.email;
  $('[data-links]').innerHTML = site.links
    .filter((l) => !l.href.startsWith('mailto:'))
    .map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a></li>`)
    .join('');
  $('[data-year]').textContent = new Date().getFullYear();
}

function imgTag(im, sizes, extra = '') {
  const small = im.kind === 'phone' ? 360 : 800;
  return `<img src="${im.src}" srcset="${im.srcSmall} ${small}w, ${im.src} ${im.w}w" sizes="${sizes}"
    width="${im.w}" height="${im.h}" alt="${esc(im.alt)}" loading="lazy" decoding="async" ${extra}>`;
}

function frame(im, index, sizes) {
  const phone = im.kind === 'phone';
  return `<div class="tilt"><button class="frame" type="button" data-open="${index}" aria-label="Enlarge: ${esc(im.alt)}">
    ${phone ? '' : '<span class="frame__bar" aria-hidden="true"><i></i><i></i><i></i></span>'}
    <span class="frame__media">${imgTag(im, sizes)}</span>
  </button></div>`;
}

// Every image for a project, in lightbox order
function imagesOf(p) {
  return [p.lead, ...(p.phones || []), ...(p.gallery || [])].filter(Boolean);
}

function stageHTML(p) {
  const all = imagesOf(p);
  const idx = (im) => all.indexOf(im);
  const phoneSizes = '(min-width: 1024px) 16vw, 30vw';

  if (p.layout === 'pipeline') {
    return `<div class="stage__main"><div class="tilt"><div class="pipeline" role="img" aria-label="Agent X pipeline: ${p.pipeline.join(', ')}, with a sample daily digest">
      <div class="pipeline__head"><span>agent-x · daily run</span><b>● live</b></div>
      <ol class="pipeline__steps">${p.pipeline.map((s) => `<li class="step">${esc(s)}</li>`).join('')}</ol>
      <div class="digest" data-digest>
        <div class="digest__row"><span class="tag tag--urgent">URGENT</span><span>pricing.pro</span><span class="digest__score">score 8 / 10</span></div>
        <p class="digest__title">Competitor raised its Pro plan price and added annual billing</p>
        <div class="digest__evidence"><span>€19 / month</span><span>€29 / month · €290 / year</span></div>
      </div>
      <div class="digest" data-digest>
        <div class="digest__row"><span class="tag tag--notable">NOTABLE</span><span>hero.main</span><span class="digest__score">score 6 / 10</span></div>
        <p class="digest__title">Homepage repositioned from “agencies” to “enterprise teams”</p>
      </div>
    </div></div></div>`;
  }

  if (p.layout === 'phones') {
    return `<div class="stage__main"><div class="phones">${p.phones
      .map((im) => `<div class="phone">${frame(im, idx(im), phoneSizes)}</div>`)
      .join('')}</div></div>`;
  }

  const back = p.gallery?.find((g) => g.kind === 'desktop' && g.h / g.w > 0.4);
  const main = `<div class="stage__main">${frame(p.lead, idx(p.lead), '(min-width: 1024px) 56vw, 92vw')}</div>`;
  const backHTML = back
    ? `<div class="stage__back" aria-hidden="true">${imgTag({ ...back, alt: '' }, '(min-width: 1024px) 34vw, 1px')}</div>`
    : '';
  const phones = p.layout === 'mixed'
    ? `<div class="phones phones--overlay">${p.phones.map((im) => `<div class="phone">${frame(im, idx(im), '(min-width: 1024px) 11vw, 20vw')}</div>`).join('')}</div>`
    : '';
  return backHTML + main + phones;
}

function thumbsHTML(p) {
  const all = imagesOf(p);
  if (all.length < 2) return '';
  return `<div class="thumbs">${all
    .map((im, i) => `<button class="thumb${im.kind === 'phone' ? ' thumb--phone' : ''}" type="button" data-open="${i}" aria-label="View screenshot: ${esc(im.alt)}">
      <img src="${im.srcSmall}" alt="" width="${im.w}" height="${im.h}" loading="lazy" decoding="async"></button>`)
    .join('')}<span class="thumbs__label">${all.length} screens</span></div>`;
}

// Projects with enough screenshots show them as a horizontal timeline instead of the 3D stage
const hasTimeline = (p) => imagesOf(p).length >= 3;

// The shots on the timeline: the project's `featured` picks, or every shot when it has none
const timelineShots = (p) => {
  const all = imagesOf(p);
  return p.featured ? all.filter((im) => p.featured.includes(im.name)) : all;
};

// Place shots in units of image height so the top and bottom rows interleave without colliding:
// each stem sits at least `step` after the previous one, and clears the shot two back on its own row.
function shotLayout(p) {
  const all = timelineShots(p);
  const inset = 0.12, step = 0.34, gap = 0.16;
  const shown = all.map((im) => Math.min(im.w / im.h, 2.1)); // very wide shots are scaled down, not cropped
  const ws = shown.map((w) => w + inset);
  const xs = [];
  all.forEach((_, i) => {
    xs[i] = i === 0 ? 0 : Math.max(xs[i - 1] + step, i > 1 ? xs[i - 2] + ws[i - 2] + gap : 0);
  });
  const width = Math.max(...all.map((_, i) => xs[i] + ws[i]));
  return { all, shown, ws, xs, width };
}

// Distance from the last stem to the end of the rail
const lastShotSpan = (p) => {
  const { xs, width } = shotLayout(p);
  return width - xs[xs.length - 1];
};

function timelineHTML(p) {
  const { all, shown, ws, xs, width } = shotLayout(p);
  // Numbers and viewer positions refer to the full set, so gaps in the numbering show there is more
  const every = imagesOf(p);
  const at = (im) => every.indexOf(im);

  return `<div class="ptl__rail" style="--rw:${width.toFixed(3)}">
    <span class="ptl__spine" data-ptl-spine aria-hidden="true"></span>
    <ol class="ptl__list">${all.map((im, i) => `
      <li class="shot shot--${i % 2 ? 'bottom' : 'top'}${im.kind === 'phone' ? ' shot--phone' : ''}" data-ptl-item
        style="--x:${xs[i].toFixed(3)};--w:${ws[i].toFixed(3)};--iw:${shown[i].toFixed(3)}">
        <span class="shot__stem" aria-hidden="true"></span>
        <span class="shot__dot" aria-hidden="true"></span>
        <figure class="shot__body">
          <span class="shot__mask"><button class="shot__frame" type="button" data-open="${at(im)}" aria-label="Enlarge: ${esc(im.alt)}">
            ${imgTag(im, im.kind === 'phone' ? '(min-width: 1024px) 12vw, 60vw' : '(min-width: 1024px) 40vw, 92vw')}
          </button></span>
          <figcaption class="mask"><span><b>${pad(at(im) + 1)}</b> ${esc(im.alt)}</span></figcaption>
        </figure>
      </li>`).join('')}
    </ol>
  </div>${moreHTML(p, every, all)}`;
}

// End-of-rail card that opens every screenshot as a grid in the viewer
function moreHTML(p, every, shown) {
  const rest = every.filter((im) => !shown.includes(im));
  if (!rest.length) return '';
  return `<button class="ptl__more" type="button" data-open-grid aria-label="View all ${every.length} ${esc(p.title)} screenshots">
    <span class="ptl__more-stack" aria-hidden="true">${rest.slice(0, 3)
      .map((im) => `<img src="${im.srcSmall}" alt="" width="${im.w}" height="${im.h}" loading="lazy" decoding="async">`)
      .join('')}</span>
    <span class="ptl__more-count">+${rest.length}</span>
    <span class="ptl__more-label">more screens</span>
    <span class="ptl__more-cta">View all ${every.length} →</span>
  </button>`;
}

function projectText(p, i, total) {
  return `<p class="project__index" data-anim><b>${pad(i + 1)}</b> / ${pad(total)} <i></i> ${esc(p.category)}</p>
    <h3 class="project__title" id="t-${p.id}" data-anim>${esc(p.title)}</h3>
    <p class="project__summary" data-anim>${esc(p.summary)}</p>
    <ul class="project__features">${p.features.map((f) => `<li data-anim>${esc(f)}</li>`).join('')}</ul>
    <ul class="badges" aria-label="Highlights">${p.highlights.map((t) => `<li class="badge">${esc(t)}</li>`).join('')}</ul>
    <p class="project__stack"><span>Built with</span> ${p.stack.map(esc).join(' · ')}</p>`;
}

function renderProjects() {
  const total = projects.length;
  $('[data-projects]').innerHTML = projects
    .map((p, i) => hasTimeline(p) ? `
    <article class="project project--timeline" id="p-${p.id}" data-project="${i}" data-ptl style="--accent:${p.accent}" aria-labelledby="t-${p.id}">
      <div class="ptl__viewport" data-ptl-viewport>
        <div class="ptl__track" data-ptl-track style="--lw:${lastShotSpan(p).toFixed(3)}">
          <div class="project__text ptl__intro">${projectText(p, i, total)}</div>
          ${timelineHTML(p)}
        </div>
      </div>
    </article>` : `
    <article class="project project--${p.layout}" id="p-${p.id}" data-project="${i}" style="--accent:${p.accent}" aria-labelledby="t-${p.id}">
      <div class="container">
        <div class="project__grid${i % 2 ? ' project__grid--reverse' : ''}">
          <div class="project__text">
            ${projectText(p, i, total)}
            ${thumbsHTML(p)}
          </div>
          <div class="project__stage">
            <div class="stage__glow" aria-hidden="true"></div>
            ${stageHTML(p)}
          </div>
        </div>
      </div>
    </article>`)
    .join('');
}

/* ---------------- Lightbox ---------------- */

function setupLightbox() {
  const dlg = $('[data-lightbox]');
  const img = $('[data-lightbox-img]');
  const caption = $('[data-lightbox-caption]');
  const counter = $('[data-lightbox-count]');
  const figure = $('.lightbox__figure', dlg);
  const grid = $('[data-lightbox-grid]');
  const gridList = $('[data-lightbox-grid-list]');
  const allBtn = $('[data-lightbox-all]');
  let list = [];
  let at = 0;
  let gridMode = false;

  // Grid mode shows every screenshot as a thumbnail; picking one switches back to the single view
  function setGrid(on) {
    gridMode = on;
    dlg.classList.toggle('is-grid', on);
    grid.hidden = !on;
    figure.hidden = on;
    allBtn.hidden = on || list.length < 2;
    const multi = !on && list.length > 1;
    $('[data-lightbox-prev]').hidden = !multi;
    $('[data-lightbox-next]').hidden = !multi;
  }

  function showGrid(focusAt = 0) {
    gridList.innerHTML = list
      .map((im, i) => `<li><button class="lightbox__cell${im.kind === 'phone' ? ' lightbox__cell--phone' : ''}" type="button" data-lb-go="${i}">
        <span class="lightbox__thumb"><img src="${im.srcSmall}" alt="" width="${im.w}" height="${im.h}" loading="lazy" decoding="async"></span>
        <span class="lightbox__cell-cap"><b>${pad(i + 1)}</b> ${esc(im.alt)}</span></button></li>`)
      .join('');
    setGrid(true);
    grid.scrollTop = 0;
    gridList.querySelector(`[data-lb-go="${focusAt}"]`)?.focus();
  }

  function show(i) {
    setGrid(false);
    at = (i + list.length) % list.length;
    const im = list[at];
    img.src = im.src;
    img.width = im.w;
    img.height = im.h;
    img.alt = im.alt;
    caption.textContent = im.alt;
    counter.textContent = `${at + 1} / ${list.length}`;
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open], [data-open-grid]');
    if (!trigger) return;
    const p = projects[Number(trigger.closest('[data-project]').dataset.project)];
    list = imagesOf(p);
    $('[data-lightbox-grid-title]').textContent = `${p.title} · ${list.length} screens`;
    dlg.style.setProperty('--accent', p.accent);
    if (trigger.hasAttribute('data-open-grid')) showGrid();
    else show(Number(trigger.dataset.open));
    document.documentElement.style.overflow = 'hidden';
    dlg.showModal();
  });

  gridList.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-lb-go]');
    if (cell) show(Number(cell.dataset.lbGo));
  });
  allBtn.addEventListener('click', () => showGrid(at));
  $('[data-lightbox-prev]').addEventListener('click', () => show(at - 1));
  $('[data-lightbox-next]').addEventListener('click', () => show(at + 1));
  $('[data-lightbox-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    if (gridMode) return;
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
  dlg.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    img.removeAttribute('src');
    gridList.innerHTML = '';
  });
}

/* ---------------- Contact ---------------- */

function setupCopy() {
  const btn = $('[data-copy-email]');
  const status = $('[data-copy-status]');
  let timer;
  btn.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(site.email);
      ok = true;
    } catch {
      // Clipboard API unavailable (e.g. insecure context): fall back to a hidden textarea
      const ta = Object.assign(document.createElement('textarea'), { value: site.email });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    status.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C';
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ''; }, 2400);
  });
}

/* ---------------- Nav ---------------- */

function setupNav() {
  const nav = $('[data-nav]');
  const toggle = $('.nav__toggle');
  const links = $('#nav-links');

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('is-open', open);
    nav.classList.toggle('menu-open', open);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Smooth jump (GSAP ScrollToPlugin when available, native smooth scroll otherwise)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-scroll]');
    if (!a) return;
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    if (window.gsap && window.ScrollToPlugin) {
      gsap.to(window, { duration: reducedMotion ? 0 : 1.1, ease: 'power3.inOut', scrollTo: { y: target, autoKill: true } });
    } else {
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    history.replaceState(null, '', a.getAttribute('href'));
  });
}

function setActive(id) {
  $$('[data-nav-link]').forEach((a) => {
    if (a.dataset.navLink === id) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });
}

/* ---------------- Hover tilt ---------------- */

function setupTilt() {
  if (reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  $$('.tilt').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      rx(-((e.clientY - r.top) / r.height - 0.5) * 12);
      ry(((e.clientX - r.left) / r.width - 0.5) * 12);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

/* ---------------- Scroll animation ---------------- */

function setupAnimations(hero) {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  document.documentElement.classList.add('has-gsap');

  // Progress bar
  const bar = $('.progress__bar');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    refreshPriority: -2,
    onUpdate: (self) => gsap.set(bar, { scaleX: self.progress }),
  });

  if (reducedMotion) {
    // Everything stays visible; pipeline shows its finished state.
    $$('.step').forEach((s) => s.classList.add('is-on'));
    setupNavTriggers();
    return;
  }

  // Hero entrance
  const heroLines = $$('[data-hero-line]');
  gsap.from(heroLines, {
    yPercent: (i, el) => (el.closest('.line') ? 110 : 0),
    y: (i, el) => (el.closest('.line') ? 0 : 24),
    opacity: (i, el) => (el.closest('.line') ? 1 : 0),
    duration: 1.2,
    ease: 'expo.out',
    stagger: 0.09,
    delay: 0.15,
  });
  gsap.from('.hero__scroll', { opacity: 0, duration: 1, delay: 1 });

  // Hero exit: content drifts up, 3D object shrinks and lifts
  gsap.to('.hero__content', {
    y: -80,
    opacity: 0.2,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => hero && hero.setScroll(self.progress),
    },
  });

  // Generic reveals (About, section headings, contact)
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  });

  // Stat count-up
  $$('[data-count]').forEach((el) => {
    const n = Number(el.dataset.count);
    if (!n) return;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: n,
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v); },
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
    el.textContent = '0';
  });

  const mm = gsap.matchMedia();

  $$('[data-project]').forEach((sec) => {
    const reverse = sec.querySelector('.project__grid--reverse') !== null;
    const main = sec.querySelector('.stage__main');
    const back = sec.querySelector('.stage__back');
    const glow = sec.querySelector('.stage__glow');
    const overlay = sec.querySelector('.phones--overlay');
    const texts = sec.querySelectorAll('[data-anim]');
    const badges = sec.querySelectorAll('.badge');
    const thumbs = sec.querySelectorAll('.thumbs > *');
    const phones = sec.querySelectorAll('.phones:not(.phones--overlay) .phone');

    // Text + badges: one-shot staggered reveal, reversed when scrolling back up
    const textTl = gsap.timeline({
      scrollTrigger: { trigger: sec, start: 'top 62%', toggleActions: 'play none none reverse' },
    });
    textTl.from(texts, { y: 32, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.06 });
    if (badges.length) textTl.from(badges, { y: 14, opacity: 0, scale: 0.9, duration: 0.5, ease: 'back.out(2)', stagger: 0.035 }, '-=0.5');
    if (thumbs.length) textTl.from(thumbs, { y: 12, opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.04 }, '-=0.35');

    if (sec.hasAttribute('data-ptl')) {
      setupProjectTimeline(sec, mm);
      return;
    }

    // Agent X pipeline: steps light up in order as the section enters
    const steps = sec.querySelectorAll('.step');
    if (steps.length) {
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 70%',
        end: 'top 10%',
        onUpdate: (self) => {
          const lit = Math.round(self.progress * steps.length);
          steps.forEach((s, i) => s.classList.toggle('is-on', i < lit));
        },
        onLeave: () => steps.forEach((s) => s.classList.add('is-on')),
      });
      gsap.from(sec.querySelectorAll('[data-digest]'), {
        y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.15,
        scrollTrigger: { trigger: sec, start: 'top 20%', toggleActions: 'play none none reverse' },
      });
    }

    mm.add('(min-width: 1024px)', () => {
      const dir = reverse ? 1 : -1;

      // Entrance: tilted, recessed screenshot rotates toward the viewer (scrubbed)
      gsap.fromTo(main,
        { rotationX: 18, rotationY: 12 * dir, scale: 0.86, y: 90, opacity: 0.25 },
        {
          rotationX: 5, rotationY: 4 * dir, scale: 0.95, y: 0, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top 90%', end: 'top 20%', scrub: 1 },
        });
      if (phones.length) {
        gsap.fromTo(phones,
          { y: (i) => 60 + i * 40, rotationY: (i) => (i - 1) * -14 },
          {
            y: 0, rotationY: (i) => (i - 1) * -8, ease: 'none',
            scrollTrigger: { trigger: sec, start: 'top 90%', end: 'top 20%', scrub: 1 },
          });
      }
      if (back) {
        gsap.fromTo(back, { y: 140 }, {
          y: -60, ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
      if (overlay) {
        gsap.fromTo(overlay, { y: 120 }, {
          y: -30, ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }

      // Pin: the section holds while the screenshot settles flat and the glow blooms.
      // Tall sections (short viewports) pin at their bottom so nothing is cut off.
      const settle = gsap.timeline({
        scrollTrigger: {
          trigger: sec,
          start: () => (sec.offsetHeight > window.innerHeight ? 'bottom bottom' : 'top top'),
          end: '+=70%',
          pin: true,
          scrub: 1,
          refreshPriority: 1,
          anticipatePin: 1,
        },
      });
      settle
        .to(main, { rotationX: 0, rotationY: 0, scale: 1, ease: 'none' }, 0)
        .fromTo(glow, { scale: 0.8, opacity: 0.35 }, { scale: 1.2, opacity: 0.7, ease: 'none' }, 0);
      if (phones.length) settle.to(phones, { rotationY: 0, ease: 'none' }, 0);
    });

    mm.add('(max-width: 1023px)', () => {
      gsap.from(main, {
        rotationX: 14, y: 60, scale: 0.94, opacity: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: main, start: 'top 88%', toggleActions: 'play none none reverse' },
      });
      if (overlay) {
        gsap.from(overlay, {
          y: 60, opacity: 0, duration: 1, delay: 0.2, ease: 'power3.out',
          scrollTrigger: { trigger: main, start: 'top 80%', toggleActions: 'play none none reverse' },
        });
      }
    });
  });

  setupNavTriggers();
}

// Screenshot timeline: the section pins, the track slides sideways, the spine draws,
// and each shot grows its stem, pops its dot and unmasks as it crosses the viewport.
function setupProjectTimeline(sec, mm) {
  const viewport = sec.querySelector('[data-ptl-viewport]');
  const track = sec.querySelector('[data-ptl-track]');
  const spine = sec.querySelector('[data-ptl-spine]');
  const items = sec.querySelectorAll('[data-ptl-item]');

  mm.add('(min-width: 1024px)', () => {
    sec.classList.add('is-pinned');
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);

    const move = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
        anticipatePin: 1,
        refreshPriority: 1, // same as the other project pins, so all pins refresh in page order
      },
    });

    // Spine keeps its drawn tip on the line where shots start to reveal (88% across)
    const spineAt = (x) => {
      const left = spine.getBoundingClientRect().left - track.getBoundingClientRect().left;
      return gsap.utils.clamp(0, 1, (viewport.clientWidth * 0.88 - left + x) / spine.offsetWidth);
    };
    gsap.fromTo(spine, { scaleX: 0 }, {
      scaleX: () => spineAt(0),
      ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top 75%', end: 'top top', scrub: 1, invalidateOnRefresh: true },
    });
    gsap.fromTo(spine, { scaleX: () => spineAt(0) }, {
      scaleX: () => spineAt(distance()),
      ease: 'none',
      immediateRender: false,
      scrollTrigger: { trigger: sec, start: 'top top', end: () => `+=${distance()}`, scrub: 1, invalidateOnRefresh: true },
    });

    items.forEach((item) => {
      const top = item.classList.contains('shot--top');
      gsap.timeline({
        scrollTrigger: { trigger: item, containerAnimation: move, start: 'left 88%', end: 'left 52%', scrub: true },
      })
        .fromTo(item.querySelector('.shot__stem'), { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: 0.35 })
        .fromTo(item.querySelector('.shot__dot'), { scale: 0 }, { scale: 1, ease: 'back.out(3)', duration: 0.2 }, '>-0.05')
        // Shots unroll away from the spine: top ones downward from their dot, bottom ones upward
        .fromTo(item.querySelector('.shot__mask'),
          { clipPath: top ? 'inset(0% 0% 100% 0%)' : 'inset(100% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: 0.6 }, 0.2)
        .fromTo(item.querySelector('.shot__frame img'), { scale: 1.2 }, { scale: 1, ease: 'power2.out', duration: 0.7 }, 0.2)
        .fromTo(item.querySelector('figcaption > span'), { yPercent: 105 }, { yPercent: 0, ease: 'power2.out', duration: 0.4 }, 0.5);
    });

    return () => sec.classList.remove('is-pinned');
  });

  // Narrow screens: a vertical list, the spine draws down and each shot unrolls once
  mm.add('(max-width: 1023px)', () => {
    gsap.fromTo(spine, { scaleY: 0 }, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: spine, start: 'top 80%', end: 'bottom 60%', scrub: true },
    });
    items.forEach((item) => {
      gsap.timeline({ scrollTrigger: { trigger: item, start: 'top 85%', toggleActions: 'play none none reverse' } })
        .from(item.querySelector('.shot__dot'), { scale: 0, duration: 0.4, ease: 'back.out(3)' })
        .fromTo(item.querySelector('.shot__mask'), { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'power3.inOut' }, 0)
        .from(item.querySelector('figcaption > span'), { yPercent: 105, duration: 0.6, ease: 'power3.out' }, 0.5);
    });
  });
}

function setupNavTriggers() {
  const count = $('[data-work-count]');
  ['hero', 'about', 'work', 'contact'].forEach((id) => {
    ScrollTrigger.create({
      trigger: `#${id}`,
      start: 'top 45%',
      end: 'bottom 45%',
      refreshPriority: -1,
      onToggle: (self) => {
        if (self.isActive) setActive(id);
        if (id === 'work' && !self.isActive) count.textContent = '';
      },
    });
  });

  $$('[data-project]').forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 45%',
      end: 'bottom 45%',
      refreshPriority: -1,
      onToggle: (self) => {
        if (self.isActive) count.textContent = `${pad(i + 1)}/${pad(projects.length)}`;
      },
    });
  });
}

/* ---------------- Boot ---------------- */

async function boot() {
  fillSite();
  renderProjects();
  setupLightbox();
  setupCopy();
  setupNav();
  setActive('hero');

  let hero = null;
  const canvasHost = $('[data-hero-canvas]');
  try {
    const mod = await import('./hero3d.js');
    hero = mod.initHero(canvasHost, { reducedMotion });
  } catch {
    hero = null;
  }
  if (!hero) document.documentElement.classList.add('no-webgl');

  if (!window.gsap || !window.ScrollTrigger || !window.ScrollToPlugin) return; // content stays fully visible
  setupAnimations(hero);
  setupTilt();

  // Re-measure once fonts and late images have settled
  if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());

  // Honour a deep link like /#contact after pins have been measured
  if (location.hash && $(location.hash)) {
    requestAnimationFrame(() => gsap.to(window, { duration: 0, scrollTo: { y: location.hash } }));
  }
}

boot();
