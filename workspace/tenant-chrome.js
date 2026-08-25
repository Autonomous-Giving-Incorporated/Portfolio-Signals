/**
 * Authenticated workspace chrome and platform-admin provision helpers.
 *
 * Platform administrators with no selected client see product chrome only.
 * Tenant name, mark, and campaign numbers come from a real selected client
 * and that client's published configuration. The module never invents a
 * fixture tenant or campaign dollar amounts.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLATFORM_EYEBROW = 'AGI Portfolio Signals · platform administration';
const PLATFORM_HEADING = 'Platform administration';
const PLATFORM_TITLE = 'AGI Portfolio Signals · Workspace';

/**
 * Label for the identity line.
 *
 * Platform administrators without a selected-client membership role always
 * resolve to platform administration. They never fall through to member.
 */
export function workspaceIdentityRoleLabel({
  isMasterAdmin = false,
  selectedClient = null,
  profile: _profile = null
} = {}) {
  if (isMasterAdmin && !selectedClient?.role) {
    return 'platform administration';
  }
  return selectedClient?.role || 'member';
}

/**
 * Choose the selected client without a silent first-row default.
 *
 * A stored preferred id or an active membership role counts as a real
 * selection. Enumerable shells for a platform administrator do not.
 */
export function resolveSelectedWorkspaceClient({
  clients = [],
  preferredClientId = null
} = {}) {
  const list = Array.isArray(clients) ? clients : [];
  return (
    list.find((client) => client.id === preferredClientId) ||
    list.find((client) => client.role) ||
    null
  );
}

function compactUsd(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (amount >= 1_000_000 && amount % 1_000_000 === 0) {
    return `$${amount / 1_000_000}M`;
  }
  if (amount >= 1_000 && amount % 1_000 === 0) {
    return `$${amount / 1_000}K`;
  }
  return `$${amount}`;
}

function publishedCampaignTargets(publishedConfig) {
  const campaign = publishedConfig?.campaign && typeof publishedConfig.campaign === 'object'
    ? publishedConfig.campaign
    : publishedConfig || {};
  return {
    minimumTarget: Number(campaign.minimumTarget),
    stretchTarget: Number(campaign.stretchTarget)
  };
}

function contextItemsFromConfig(publishedConfig) {
  if (!publishedConfig) return [];
  const { minimumTarget, stretchTarget } = publishedCampaignTargets(publishedConfig);
  const items = [];
  const minimum = compactUsd(minimumTarget);
  const stretch = compactUsd(stretchTarget);
  if (minimum) items.push({ amount: minimum, label: 'minimum campaign' });
  if (stretch) items.push({ amount: stretch, label: 'transformation path' });
  return items;
}

function tenantMarkSrc(client) {
  if (!client?.slug) return '';
  return `assets/tenants/${encodeURIComponent(client.slug)}/icon.svg`;
}

/**
 * Resolve header copy, tenant chip visibility, and campaign context.
 *
 * When no client is selected, return platform chrome and hide the tenant
 * chip. Campaign dollar items appear only when the published configuration
 * includes those numbers.
 */
export function resolveWorkspaceChrome({ client = null, publishedConfig = null } = {}) {
  if (!client?.id) {
    return {
      showTenantChip: false,
      tenantName: '',
      tenantMarkSrc: '',
      eyebrow: PLATFORM_EYEBROW,
      heading: PLATFORM_HEADING,
      contextItems: [],
      documentTitle: PLATFORM_TITLE
    };
  }

  const tenantName = String(
    publishedConfig?.organization_name || client.display_name || ''
  ).trim();
  const heading = String(
    publishedConfig?.campaign_title || tenantName || PLATFORM_HEADING
  ).trim();

  return {
    showTenantChip: true,
    tenantName,
    tenantMarkSrc: tenantMarkSrc(client),
    eyebrow: tenantName
      ? `AGI Portfolio Signals · ${tenantName}`
      : PLATFORM_EYEBROW,
    heading,
    contextItems: contextItemsFromConfig(publishedConfig),
    documentTitle: tenantName
      ? `AGI Portfolio Signals · ${tenantName}`
      : PLATFORM_TITLE
  };
}

/**
 * Resolve `provision_client.p_initial_director` without hunting UUIDs.
 *
 * An empty field uses the signed-in profile. A UUID or email must match an
 * existing profile from `lookupProfile`. The helper does not create users.
 */
export async function resolveInitialDirectorId({
  directorInput = '',
  sessionUserId = '',
  sessionEmail = '',
  lookupProfile
} = {}) {
  if (typeof lookupProfile !== 'function') {
    throw new Error('Profile lookup is required.');
  }
  if (!sessionUserId) {
    throw new Error('Signed-in profile required.');
  }

  const trimmed = String(directorInput || '').trim();
  const resolveSelf = async () => {
    const profile = await lookupProfile({ id: sessionUserId });
    if (!profile?.id) {
      throw new Error('Signed-in account has no existing profile.');
    }
    return profile.id;
  };

  if (!trimmed) {
    return resolveSelf();
  }

  if (UUID_PATTERN.test(trimmed)) {
    const profile = await lookupProfile({ id: trimmed });
    if (!profile?.id) {
      throw new Error('No existing profile uses that UUID.');
    }
    return profile.id;
  }

  const email = trimmed.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(
      'Enter an existing profile email or UUID, or leave the field blank to use your signed-in account.'
    );
  }

  if (sessionEmail && sessionEmail.toLowerCase() === email) {
    return resolveSelf();
  }

  const profile = await lookupProfile({ email });
  if (!profile?.id) {
    throw new Error('No existing profile uses that email.');
  }
  return profile.id;
}
