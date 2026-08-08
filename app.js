const root = document.documentElement;

// AGI product shell only. Tenant palettes load from assets/tenants/<slug>/ via public-client-config.js.
const brandStyles = document.createElement('link');
brandStyles.rel = 'stylesheet';
brandStyles.href = 'brand.css?v=agi-shell-2';
document.head.appendChild(brandStyles);

// Do not load reference-tenant (Hacker Dojo) theme on the unauthenticated product shell.
// Tenant theme is applied only after requireTenantAccess grants dataset.tenantAccess.

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = 'assets/brand/agi-mark.png';
document.head.appendChild(favicon);

const header = document.querySelector('.site-header');
const headerCopy = header?.querySelector(':scope > div:not(.header-actions)');
if (header && headerCopy) {
  headerCopy.classList.add('hero-copy');

  const identity = document.createElement('div');
  identity.className = 'brand-identity';
  // Tenant chip is authenticated-only (workspace). Public shell shows product chrome only.
  identity.innerHTML = `
    <img class="brand-mark" src="assets/brand/agi-wordmark.png" alt="Autonomously Giving Incorporated" width="1200" height="290" />
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="brand-product">Portfolio Signals<br />Decision Workspace</span>
    <nav class="brand-suite-links" aria-label="AGI product suite">
      <a href="https://autogive.app/">AGI</a>
      <a href="https://autogive.app/impact-relay/">Impact Relay</a>
    </nav>
  `;
  header.prepend(identity);

  const isOverview = location.pathname.endsWith('/') || location.pathname.endsWith('/index.html') || location.pathname.endsWith('/portfolio-signals');
  if (isOverview) {
    const eyebrow = headerCopy.querySelector('.eyebrow');
    const title = headerCopy.querySelector('h1');
    if (eyebrow) eyebrow.textContent = 'AGI product · Portfolio Signals';
    if (title) title.textContent = 'Decision workspace';
  }
}

// Campaign status bar is tenant-canonical data — only inject inside authorized tenant-data root.
const tenantDataRoot = document.querySelector('.tenant-data-root, [data-tenant-data]');
const nav = tenantDataRoot?.querySelector('.primary-nav') || null;
if (nav && tenantDataRoot) {
  const statusBar = document.createElement('aside');
  statusBar.className = 'campaign-status-bar';
  statusBar.setAttribute('aria-label', 'Campaign status');
  statusBar.setAttribute('data-tenant-data', '');
  statusBar.innerHTML = `
    <div class="status-event">
      <span>Campaign event</span>
      <strong>SupperHappyFundHouse</strong>
      <small>August 21, 2026</small>
    </div>
    <div class="status-progress">
      <span>Minimum campaign</span>
      <strong>$420K · approval gate open</strong>
      <div class="status-track" aria-hidden="true"><i style="width: 18%"></i></div>
      <small>Illustrative readiness indicator, not funds raised</small>
    </div>
    <div class="status-progress">
      <span>Transformation path</span>
      <strong>$2M · board case required</strong>
      <div class="status-track" aria-hidden="true"><i style="width: 8%"></i></div>
      <small>Separate multi-year plan</small>
    </div>
  `;
  nav.insertAdjacentElement('afterend', statusBar);
}

const footer = document.querySelector('footer');
if (footer) {
  footer.innerHTML = `
    <div class="footer-brand">
      <img src="assets/brand/agi-mark.png" alt="" width="38" height="38" />
      <span>Autonomously Giving Incorporated · Portfolio Signals</span>
    </div>
    <div class="footer-meta">
      <small>Software by Zero State</small>
      <a href="https://autogive.app/brand#tokens">Tokens</a>
      <a href="https://autogive.app/brand#logo">Logo use</a>
      <a href="https://autogive.app/legal">Legal</a>
      <a href="https://autogive.app/legal/privacy">Privacy</a>
      <a href="https://autogive.app/legal/terms">Terms</a>
    </div>
  `;
}

const themeToggle = document.getElementById('themeToggle');
const storedTheme = localStorage.getItem('agi-theme') || localStorage.getItem('hd-theme');
if (storedTheme) root.dataset.theme = storedTheme;

function syncThemeControl() {
  if (!themeToggle) return;
  const isDark = root.dataset.theme === 'dark';
  themeToggle.textContent = isDark ? 'Use light theme' : 'Use dark theme';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
}

syncThemeControl();
themeToggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('agi-theme', next);
  syncThemeControl();
});

const navLinks = [...document.querySelectorAll('.primary-nav a[href^="#"]')];
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

function setActiveSection(sectionId) {
  navLinks.forEach((link) => {
    const active = link.getAttribute('href') === `#${sectionId}`;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

if ('IntersectionObserver' in window && navSections.length) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActiveSection(visible.target.id);
  }, { rootMargin: '-18% 0px -62% 0px', threshold: [0.08, 0.25, 0.5] });
  navSections.forEach((section) => observer.observe(section));
}
setActiveSection(location.hash.replace('#', '') || navSections[0]?.id || 'overview');

const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.tab-panel')];
tabs.forEach((tab) => {
  tab.setAttribute('aria-selected', String(tab.classList.contains('active')));
  tab.addEventListener('click', () => {
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      const active = panel.id === tab.dataset.tab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  });
});

const sponsorFilter = document.getElementById('sponsorFilter');
sponsorFilter?.addEventListener('input', () => {
  const term = sponsorFilter.value.trim().toLowerCase();
  document.querySelectorAll('#sponsorTable tbody tr').forEach((row) => {
    row.hidden = !row.textContent.toLowerCase().includes(term);
  });
});

const decisionCopy = {
  '420k': {
    title: 'Approve the $420K campaign case',
    text: 'Leadership must reconcile the venue scenarios, transition costs, campaign expenses, expected membership revenue, and unrestricted operating need into one approved net use-of-funds schedule.'
  },
  '2m': {
    title: 'Approve or defer the $2M transformation case',
    text: 'The stretch case requires a separate multi-year capital and program plan, named delivery owners, demand evidence, milestones, governance, and absorptive-capacity analysis. It should not be marketed as a larger operating appeal.'
  },
  sponsors: {
    title: 'Approve sponsor benefits and exclusions',
    text: 'Every sponsor level needs a costed benefit inventory, fulfillment owner, tax and governance review, data boundaries, and explicit exclusions. Board or advisory status must never function as an automatic donor perk.'
  },
  privacy: {
    title: 'Approve privacy and outreach policy',
    text: 'The source registry contains personal contact and participation data. Leadership must define lawful outreach authority, suppression rules, retention, role-based access, relationship ownership, and audit logging before any campaign activation.'
  }
};

const dialog = document.getElementById('decisionDialog');
const dialogTitle = document.getElementById('dialogTitle');
const dialogText = document.getElementById('dialogText');
document.querySelectorAll('.decision-button').forEach((button) => {
  button.addEventListener('click', () => {
    const item = decisionCopy[button.dataset.decision];
    if (!item || !dialog || !dialogTitle || !dialogText) return;
    dialogTitle.textContent = item.title;
    dialogText.textContent = item.text;
    dialog.showModal();
  });
});
