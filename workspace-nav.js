const nav = document.getElementById('roleNav');
const content = document.getElementById('workspaceContent');

if (nav) {
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Authorized campaign workspace sections');

  const observer = new MutationObserver(() => enhanceNavigation());
  observer.observe(nav, { childList: true });
  enhanceNavigation();
}

function enhanceNavigation() {
  const buttons = [...nav.querySelectorAll('.workspace-nav-button')];
  if (!buttons.length) return;

  buttons.forEach((button, index) => {
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', button.classList.contains('is-active') ? 'true' : 'false');
    button.tabIndex = index === 0 ? 0 : -1;

    if (!button.dataset.navEnhanced) {
      button.dataset.navEnhanced = 'true';
      button.addEventListener('click', () => activateButton(button));
      button.addEventListener('keydown', handleArrowNavigation);
    }
  });

  if (!buttons.some(button => button.classList.contains('is-active'))) {
    buttons[0].click();
  }
}

function activateButton(activeButton) {
  nav.querySelectorAll('.workspace-nav-button').forEach(button => {
    const active = button === activeButton;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });

  activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  content?.setAttribute('aria-labelledby', activeButton.id || ensureButtonId(activeButton));
}

function ensureButtonId(button) {
  const section = button.dataset.section || 'section';
  button.id = `workspace-nav-${section}`;
  return button.id;
}

function handleArrowNavigation(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();

  const buttons = [...nav.querySelectorAll('.workspace-nav-button')];
  const currentIndex = buttons.indexOf(event.currentTarget);
  let nextIndex = currentIndex;

  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = buttons.length - 1;

  buttons[nextIndex].focus();
  buttons[nextIndex].click();
}
