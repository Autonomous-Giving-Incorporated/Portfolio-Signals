const root = document.documentElement;

// Load the Hacker Dojo brand layer without coupling it to the base dashboard stylesheet.
const brandStyles = document.createElement('link');
brandStyles.rel = 'stylesheet';
brandStyles.href = 'brand.css';
document.head.appendChild(brandStyles);

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = 'assets/brand/hacker-dojo-icon.svg';
document.head.appendChild(favicon);

const header = document.querySelector('.site-header');
const headerCopy = header?.querySelector(':scope > div:not(.header-actions)');
if (header && headerCopy) {
  headerCopy.classList.add('hero-copy');

  const identity = document.createElement('div');
  identity.className = 'brand-identity';
  identity.innerHTML = `
    <img class="brand-mark" src="assets/brand/hacker-dojo-icon.svg" alt="Hacker Dojo" width="64" height="64" />
    <span class="brand-wordmark"><strong>HACKER</strong><strong>DOJO</strong></span>
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="brand-product">Campaign Control Center</span>
  `;
  header.prepend(identity);

  const eyebrow = headerCopy.querySelector('.eyebrow');
  const title = headerCopy.querySelector('h1');
  if (eyebrow) eyebrow.textContent = 'Director workspace · Neon Genie intelligence';
  if (title) title.textContent = 'Campaign Control Center';
}

const nav = document.querySelector('.primary-nav');
if (nav) {
  const statusBar = document.createElement('aside');
  statusBar.className = 'campaign-status-bar';
  statusBar.setAttribute('aria-label', 'Campaign status');
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
      <img src="assets/brand/hacker-dojo-icon.svg" alt="" width="38" height="38" />
      <span>Hacker Dojo Campaign Control Center</span>
    </div>
    <div class="footer-meta">
      <small>Powered by Neon Genie</small>
      <small>Advisory state · No outreach authority granted</small>
    </div>
  `;
}

const themeToggle = document.getElementById('themeToggle');
const storedTheme = localStorage.getItem('hd-theme');
if (storedTheme) root.dataset.theme = storedTheme;

themeToggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('hd-theme', next);
});

const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.tab-panel')];
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
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
    dialogTitle.textContent = item.title;
    dialogText.textContent = item.text;
    dialog.showModal();
  });
});
