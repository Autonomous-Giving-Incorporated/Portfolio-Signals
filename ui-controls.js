function rowsFor(control) {
  const selector = control.dataset.filterTarget || control.dataset.rangeTarget;
  return selector ? [...document.querySelectorAll(selector)] : [];
}

function applyTableFilters(tableId) {
  const controls = [...document.querySelectorAll(`[data-filter-table="${tableId}"]`)];
  const rows = [...document.querySelectorAll(`#${tableId} tbody tr`)];
  rows.forEach(row => {
    row.hidden = controls.some(control => {
      const field = control.dataset.filterField;
      const expected = control.value.trim().toLowerCase();
      if (!expected || expected === 'all') return false;
      return String(row.dataset[field] || '').toLowerCase() !== expected;
    });
  });
  const count = rows.filter(row => !row.hidden).length;
  document.querySelector(`[data-visible-count="${tableId}"]`)?.replaceChildren(String(count));
}

document.querySelectorAll('[data-filter-table]').forEach(control => {
  control.addEventListener('change', () => applyTableFilters(control.dataset.filterTable));
  control.addEventListener('input', () => applyTableFilters(control.dataset.filterTable));
  applyTableFilters(control.dataset.filterTable);
});

document.querySelectorAll('input[type="range"][data-range-output]').forEach(control => {
  const output = document.getElementById(control.dataset.rangeOutput);
  const suffix = control.dataset.rangeSuffix || '';
  const update = () => {
    if (output) output.textContent = `${control.value}${suffix}`;
    rowsFor(control).forEach(row => {
      const score = Number(row.dataset.score || 0);
      row.hidden = score < Number(control.value);
    });
  };
  control.addEventListener('input', update);
  update();
});

document.querySelectorAll('[data-tooltip]').forEach(trigger => {
  const description = document.createElement('span');
  const id = `tooltip-${crypto.randomUUID()}`;
  description.id = id;
  description.className = 'tooltip-content';
  description.setAttribute('role', 'tooltip');
  description.textContent = trigger.dataset.tooltip;
  trigger.setAttribute('aria-describedby', id);
  if (!trigger.hasAttribute('tabindex')) trigger.tabIndex = 0;
  trigger.classList.add('tooltip-trigger');
  trigger.appendChild(description);
});
