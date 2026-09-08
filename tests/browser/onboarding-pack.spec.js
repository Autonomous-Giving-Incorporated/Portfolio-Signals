import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// All API traffic stays in this browser fixture; no real tenant/auth/storage writes.
async function mount(page, documents = [], messages = {}) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: 'export function createClient() { throw new Error("Unexpected client creation"); }' });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/onboarding-test') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Document collection test</title><link rel="stylesheet" href="/styles.css"><body><main id="pack"></main></body></html>' });
    return route.continue();
  });
  await page.goto('/onboarding-test');
  await page.evaluate(async ({ docs, messages }) => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = { supabaseUrl: location.origin, supabaseAnonKey: 'fixture-public-key', onboardingMessages: messages };
    window.calls = [];
    window.pack = { pack: { status: 'in_progress' }, required_slots: ['governance'], optional_slots: ['other'], slots: {}, documents: docs };
    const { mountOnboardingPack } = await import('/workspace/onboarding-pack.js');
    await mountOnboardingPack(document.querySelector('#pack'), { clientId: 'org_test', session: {
      session: { access_token: 'fixture-token' }, selectedClient: { display_name: 'Test tenant' },
      supabase: { rpc: async (name, args) => {
        window.calls.push({ name, args });
        if (name === 'confirm_onboarding_document') {
          const doc = window.pack.documents.find(d => d.id === args.p_document_id);
          doc.status = 'confirmed'; doc.confirmed_type = args.p_type;
          window.pack.slots[args.p_type] = { document: doc, required: true };
          window.pack.pack.status = 'ready';
        }
        return { data: structuredClone(window.pack), error: null };
      } }
    } });
  }, { docs: documents, messages });
}

async function drop(page, files) {
  await page.locator('#onboardingDropzone').evaluate((el, entries) => {
    const transfer = new DataTransfer();
    for (const f of entries) transfer.items.add(new File([new Uint8Array(f.size ?? 4)], f.name, { type: f.type || '' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, files);
}

test('reports server and network errors without losing successful uploads on refresh failure', async ({ page }) => {
  await mount(page);
  let count = 0;
  await page.route('**/functions/v1/upload-onboarding-document', async route => {
    count += 1;
    if (count === 1) return route.fulfill({ status: 403, json: { error: 'aal2_session_required' } });
    if (count === 2) return route.abort('failed');
    return route.fulfill({ json: { document: { id: 'stored' } } });
  });
  await page.evaluate(() => {
    // Fail only the post-upload refresh, using the same injected RPC boundary.
    Object.defineProperty(window.pack, 'pack', { get() { throw new Error('Refresh unavailable'); } });
  });
  await drop(page, [{ name: 'denied.pdf' }, { name: 'offline.pdf' }, { name: 'stored.pdf' }]);
  await expect(page.locator('#onboardingPackStatus')).toContainText('1 uploaded · 2 failed');
  await expect(page.locator('#onboardingPackStatus')).toContainText('Reload the pack');
  await expect(page.locator('#onboardingUploadResults')).toContainText('aal2_session_required');
  await expect(page.locator('#onboardingUploadResults')).toContainText('stored.pdf: Uploaded.');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
});

test('localizes collection controls and validation without rendering message markup', async ({ page }) => {
  await mount(page, [], { chooseFiles: 'Elegir archivos', emptyFile: '<b>Archivo vacío</b>' });
  await expect(page.getByRole('button', { name: 'Elegir archivos' })).toBeVisible();
  await drop(page, [{ name: 'empty.pdf', size: 0 }]);
  await expect(page.locator('#onboardingUploadResults')).toContainText('<b>Archivo vacío</b>');
  await expect(page.locator('#onboardingUploadResults b')).toHaveCount(0);
});

test('keyboard chooser, safe preview and explicit slot assignment preserve focus', async ({ page }) => {
  await mount(page, [
    { id: 'doc1', original_filename: '<img src=x onerror=alert(1)>.pdf', status: 'stored', suggested_type: 'governance' },
    { id: 'crm1', original_filename: 'donors.csv', status: 'parked_crm' }
  ]);
  await page.locator('#onboardingDropzone').focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles([]);
  await page.route('**/functions/v1/onboarding-document-url', route => route.fulfill({ json: { signedUrl: 'javascript:alert(1)' } }));
  await page.locator('[data-preview="doc1"]').click();
  await expect(page.locator('#onboardingPackStatus')).toContainText('Unsafe preview URL');
  await expect(page.getByRole('link', { name: 'Open private preview' })).toHaveCount(0);
  await page.route('**/functions/v1/onboarding-document-url', route => route.fulfill({ json: { signedUrl: 'http://127.0.0.1:4173/storage/v1/object/sign/campaign-private/onboarding/org_test/doc1/file.pdf?token=fixture' } }));
  await page.locator('[data-preview="doc1"]').click();
  const preview = page.getByRole('link', { name: 'Open private preview' });
  await expect(preview).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(preview).toHaveAttribute('target', '_blank');
  await expect(preview).toBeFocused();
  await expect(page.locator('[data-doc-id="doc1"] img')).toHaveCount(0);
  await expect(page.locator('[data-doc-id="crm1"] [data-confirm]')).toHaveCount(0);
  await page.locator('[data-confirm-type="doc1"]').selectOption('governance');
  await page.locator('[data-confirm="doc1"]').click();
  await expect(page.locator('[data-slot="governance"]')).toContainText('<img src=x');
  await expect(page.locator('[data-pack-status="ready"]')).toBeVisible();
  await expect(page.locator('#onboardingPackStatus')).toBeFocused();
  expect(await page.evaluate(() => window.calls.filter(c => c.name === 'confirm_onboarding_document'))).toEqual([
    { name: 'confirm_onboarding_document', args: { p_document_id: 'doc1', p_type: 'governance' } }
  ]);
  const audit = await new AxeBuilder({ page }).include('#pack').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('validates a mixed drop before upload, reports batch progress and prevents duplicate submissions', async ({ page }) => {
  await mount(page);
  const uploads = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/functions/v1/upload-onboarding-document', async route => {
    uploads.push(route.request().postData());
    await gate;
    await route.fulfill({ json: { document: { id: 'new' } } });
  });
  await drop(page, [{ name: 'empty.pdf', size: 0 }, { name: 'large.pdf', size: 26214401 }, { name: 'bad.exe' }, { name: 'bylaws.pdf' }]);
  await expect(page.getByRole('progressbar', { name: 'Upload progress' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeDisabled();
  await expect.poll(() => uploads.length).toBe(1);
  await drop(page, [{ name: 'duplicate.pdf' }]);
  expect(uploads).toHaveLength(1);
  release();
  await expect(page.locator('#onboardingPackStatus')).toContainText('1 uploaded');
  await expect(page.locator('#onboardingPackStatus')).toContainText('3 failed');
  await expect(page.locator('#onboardingUploadResults')).toContainText('empty.pdf');
  await expect(page.locator('#onboardingUploadResults')).toContainText('25 MiB');
  await expect(page.locator('#onboardingUploadResults')).toContainText('Unsupported');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  expect(uploads[0]).toContain('name="client_id"');
  expect(uploads[0]).toContain('org_test');
  expect(uploads[0]).toContain('name="document"; filename="bylaws.pdf"');
});
