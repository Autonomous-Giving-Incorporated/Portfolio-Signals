import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  resolveInitialDirectorId,
  resolveSelectedWorkspaceClient,
  resolveWorkspaceChrome,
  workspaceIdentityRoleLabel
} from '../workspace/tenant-chrome.js';

const workspaceHtml = readFileSync(new URL('../workspace.html', import.meta.url), 'utf8');

describe('workspace.html stays free of fixture tenant chrome', () => {
  test('does not embed Hacker Dojo name, icon path, or campaign dollar defaults', () => {
    assert.doesNotMatch(workspaceHtml, /Hacker Dojo/);
    assert.doesNotMatch(workspaceHtml, /hacker-dojo/);
    assert.doesNotMatch(workspaceHtml, /\$420K/);
    assert.doesNotMatch(workspaceHtml, /\$2M/);
    assert.doesNotMatch(workspaceHtml, /tenant operations/);
    assert.doesNotMatch(workspaceHtml, /Campaign operations/);
  });

  test('hides the tenant chip and context strip until a client is selected', () => {
    assert.match(workspaceHtml, /class="tenant-chip"[^>]*\bhidden\b/);
    assert.match(workspaceHtml, /class="workspace-context-strip"[^>]*\bhidden\b/);
    assert.match(workspaceHtml, /data-workspace-eyebrow/);
    assert.match(workspaceHtml, /data-workspace-heading/);
  });
});

describe('workspaceIdentityRoleLabel', () => {
  test('uses platform administration when isMasterAdmin and no selected client role', () => {
    assert.equal(
      workspaceIdentityRoleLabel({
        isMasterAdmin: true,
        selectedClient: null,
        profile: { role: 'director' }
      }),
      'platform administration'
    );
    assert.equal(
      workspaceIdentityRoleLabel({
        isMasterAdmin: true,
        selectedClient: { id: 'org_hacker_dojo', display_name: 'Hacker Dojo' },
        profile: { role: 'director' }
      }),
      'platform administration'
    );
  });

  test('never falls through to member for a platform admin', () => {
    const label = workspaceIdentityRoleLabel({
      isMasterAdmin: true,
      selectedClient: null,
      profile: {}
    });
    assert.equal(label, 'platform administration');
    assert.notEqual(label, 'member');
  });

  test('uses the selected client membership role when present', () => {
    assert.equal(
      workspaceIdentityRoleLabel({
        isMasterAdmin: true,
        selectedClient: { id: 'org_hacker_dojo', role: 'director' },
        profile: { role: 'director' }
      }),
      'director'
    );
    assert.equal(
      workspaceIdentityRoleLabel({
        isMasterAdmin: false,
        selectedClient: { id: 'org_example', role: 'campaign_lead' },
        profile: {}
      }),
      'campaign_lead'
    );
  });

  test('uses member only for a non-admin without a membership role', () => {
    assert.equal(
      workspaceIdentityRoleLabel({
        isMasterAdmin: false,
        selectedClient: null,
        profile: { role: 'director' }
      }),
      'member'
    );
  });
});

describe('resolveSelectedWorkspaceClient', () => {
  const enumerable = [
    { id: 'org_hacker_dojo', display_name: 'Hacker Dojo' },
    { id: 'org_platform_isolation', display_name: 'Platform Isolation' }
  ];

  test('does not silently select the first enumerable client', () => {
    assert.equal(
      resolveSelectedWorkspaceClient({
        clients: enumerable,
        preferredClientId: null
      }),
      null
    );
  });

  test('selects an explicit preferred client the caller can enumerate', () => {
    assert.deepEqual(
      resolveSelectedWorkspaceClient({
        clients: enumerable,
        preferredClientId: 'org_platform_isolation'
      }),
      enumerable[1]
    );
  });

  test('selects a membership-backed client when no preferred id exists', () => {
    const withRole = [
      { id: 'org_hacker_dojo', display_name: 'Hacker Dojo' },
      { id: 'org_example', display_name: 'Example', role: 'director' }
    ];
    assert.deepEqual(
      resolveSelectedWorkspaceClient({
        clients: withRole,
        preferredClientId: null
      }),
      withRole[1]
    );
  });
});

describe('resolveWorkspaceChrome', () => {
  test('returns platform chrome when no client is selected', () => {
    const chrome = resolveWorkspaceChrome({ client: null, publishedConfig: null });
    assert.equal(chrome.showTenantChip, false);
    assert.equal(chrome.tenantMarkSrc, '');
    assert.equal(chrome.eyebrow, 'AGI Portfolio Signals · platform administration');
    assert.equal(chrome.heading, 'Platform administration');
    assert.deepEqual(chrome.contextItems, []);
    assert.equal(chrome.documentTitle, 'AGI Portfolio Signals · Workspace');
  });

  test('uses the selected client display name and published campaign copy', () => {
    const chrome = resolveWorkspaceChrome({
      client: { id: 'org_example', slug: 'example', display_name: 'Example Civic' },
      publishedConfig: {
        organization_name: 'Example Civic',
        campaign_title: 'Fund the next cohort',
        assets: { icon_path: null },
        campaign: { minimumTarget: 150000, stretchTarget: 900000 }
      }
    });
    assert.equal(chrome.showTenantChip, true);
    assert.equal(chrome.tenantName, 'Example Civic');
    assert.equal(chrome.tenantMarkSrc, 'assets/tenants/example/icon.svg');
    assert.equal(chrome.eyebrow, 'AGI Portfolio Signals · Example Civic');
    assert.equal(chrome.heading, 'Fund the next cohort');
    assert.deepEqual(chrome.contextItems, [
      { amount: '$150K', label: 'minimum campaign' },
      { amount: '$900K', label: 'transformation path' }
    ]);
    assert.equal(chrome.documentTitle, 'AGI Portfolio Signals · Example Civic');
  });

  test('does not invent campaign dollars when published config omits them', () => {
    const chrome = resolveWorkspaceChrome({
      client: { id: 'org_example', slug: 'example', display_name: 'Example Civic' },
      publishedConfig: { organization_name: 'Example Civic' }
    });
    assert.deepEqual(chrome.contextItems, []);
    assert.doesNotMatch(JSON.stringify(chrome), /420K|2M|420000|2000000/);
  });
});

describe('resolveInitialDirectorId', () => {
  const sessionUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const profiles = new Map([
    [sessionUserId, { id: sessionUserId, email: 'zer0state@zer0state.com' }],
    [otherUserId, { id: otherUserId, email: 'director@example.invalid' }]
  ]);

  function lookupProfile({ id, email } = {}) {
    if (id) return profiles.get(id) || null;
    if (email) {
      return [...profiles.values()].find((row) => row.email === email) || null;
    }
    return null;
  }

  test('defaults an empty field to the signed-in profile', async () => {
    assert.equal(
      await resolveInitialDirectorId({
        directorInput: '',
        sessionUserId,
        sessionEmail: 'zer0state@zer0state.com',
        lookupProfile
      }),
      sessionUserId
    );
  });

  test('accepts an existing profile email and fails closed for an unknown email', async () => {
    assert.equal(
      await resolveInitialDirectorId({
        directorInput: 'director@example.invalid',
        sessionUserId,
        sessionEmail: 'zer0state@zer0state.com',
        lookupProfile
      }),
      otherUserId
    );
    await assert.rejects(
      () => resolveInitialDirectorId({
        directorInput: 'missing@example.invalid',
        sessionUserId,
        sessionEmail: 'zer0state@zer0state.com',
        lookupProfile
      }),
      /no existing profile uses that email/i
    );
  });

  test('accepts an existing profile UUID and rejects an unknown UUID', async () => {
    assert.equal(
      await resolveInitialDirectorId({
        directorInput: otherUserId,
        sessionUserId,
        sessionEmail: 'zer0state@zer0state.com',
        lookupProfile
      }),
      otherUserId
    );
    await assert.rejects(
      () => resolveInitialDirectorId({
        directorInput: '33333333-3333-4333-8333-333333333333',
        sessionUserId,
        sessionEmail: 'zer0state@zer0state.com',
        lookupProfile
      }),
      /no existing profile uses that UUID/i
    );
  });
});
