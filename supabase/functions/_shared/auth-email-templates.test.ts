import assert from 'node:assert/strict';
import test from 'node:test';
import { renderAuthEmail } from './auth-email-templates.ts';

const actionUrl = 'https://autogive.app/portfolio-signals/workspace?token_hash=test&type=magiclink';

test('platform administrator template stays outside tenant authority', () => {
  const email = renderAuthEmail({ audience: 'platform_admin', actionUrl, displayName: 'Admin' });
  assert.match(email.subject, /administrator/i);
  assert.match(email.html, /does not grant tenant-private access/i);
  assert.ok(!email.html.includes('undefined'));
});

test('tenant template escapes display content', () => {
  const email = renderAuthEmail({
    audience: 'tenant_member',
    actionUrl,
    displayName: '<Admin>',
    clientName: 'Example & Co',
    role: 'director'
  });
  assert.match(email.html, /&lt;Admin&gt;/);
  assert.match(email.html, /Example &amp; Co/);
  assert.doesNotMatch(email.html, /<Admin>/);
});

test('delegate invitation includes only approved scope labels', () => {
  const email = renderAuthEmail({
    audience: 'delegate_invite',
    actionUrl,
    clientName: 'Example Tenant',
    scopes: ['identity_support', 'not-a-real-scope']
  });
  assert.match(email.subject, /infrastructure delegate/i);
  assert.match(email.html, /Identity support/);
  assert.doesNotMatch(email.html, /not-a-real-scope/);
  assert.match(email.text, /no campaign, donor, outreach, payment, or allocation authority/i);
});

test('delegate sign-in distinguishes sign-in from invitation acceptance', () => {
  const email = renderAuthEmail({
    audience: 'delegate',
    actionUrl,
    clientName: 'Example Tenant',
    scopes: ['delivery_observability']
  });
  assert.match(email.subject, /sign-in link/i);
  assert.match(email.html, /Sign in to delegated access/);
  assert.doesNotMatch(email.html, /Accept delegate invitation/);
});

test('tenant administrator template is distinct and states director authority boundary', () => {
  const email = renderAuthEmail({
    audience: 'tenant_admin',
    actionUrl,
    displayName: 'Dana',
    clientName: 'Example & Co',
    role: 'director'
  });
  assert.match(email.subject, /tenant administrator/i);
  assert.match(email.html, /Sign in as tenant director/);
  assert.match(email.html, /does not grant outreach, allocation, payment, or publication authority/i);
  assert.match(email.html, /Example &amp; Co/);
  assert.doesNotMatch(email.html, /platform control plane/);
  assert.doesNotMatch(email.html, /<Admin>|undefined/);
});

test('brand chrome uses AGI tokens (gold accent, carbon action, no legacy palette)', () => {
  for (const audience of ['platform_admin', 'tenant_admin', 'tenant_member', 'delegate_invite', 'delegate'] as const) {
    const email = renderAuthEmail({ audience, actionUrl, displayName: 'Sam', clientName: 'Example Tenant', scopes: ['identity_support'] });
    assert.match(email.html, /border-top:4px solid #e6b23c/, `${audience} keeps the gold accent rule`);
    assert.match(email.html, /bgcolor="#0e1116"/, `${audience} uses the carbon primary action`);
    assert.doesNotMatch(email.html, /#123f36|#19734a|#f4f7f6/, `${audience} drops the legacy palette`);
    assert.ok(!email.html.includes('undefined'), `${audience} has no undefined interpolation`);
  }
});

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
