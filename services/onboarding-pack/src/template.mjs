export const TEMPLATE_VERSION = 'onboarding_pack_v1';
export const MAX_BYTES = 25 * 1024 * 1024;
export const REQUIRED_SLOTS = [
  'org_legal_name_proof',
  'tax_exempt_or_ein',
  'governance',
  'brand_logo',
  'primary_contact'
];
export const OPTIONAL_SLOTS = [
  'w9',
  'board_list',
  'brand_kit',
  'campaign_brief',
  'impact_sample',
  'other'
];
export const ALL_SLOTS = [...REQUIRED_SLOTS, ...OPTIONAL_SLOTS];

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export const PARK_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export const PARK_EXT = new Set(['.csv', '.xls', '.xlsx']);
