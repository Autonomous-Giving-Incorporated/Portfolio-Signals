const root = document.documentElement;
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
