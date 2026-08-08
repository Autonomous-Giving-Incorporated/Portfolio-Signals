import { ALLOWED_MIME, PARK_EXT, PARK_MIME } from './template.mjs';

const RULES = [
  { type: 'governance', re: /bylaw|articles\s*of|constitution/i, confidence: 0.85 },
  { type: 'tax_exempt_or_ein', re: /\bein\b|501\s*\(?\s*c\s*\)?\s*3|tax[-_ ]?exempt|determination/i, confidence: 0.85 },
  { type: 'org_legal_name_proof', re: /formation|articles\s*of\s*incorp|certificate\s*of|sos[_-]?filing/i, confidence: 0.8 },
  { type: 'brand_logo', re: /logo|wordmark|icon/i, confidence: 0.8 },
  { type: 'primary_contact', re: /contact|ops[_-]?card|primary[_-]?contact/i, confidence: 0.75 },
  { type: 'w9', re: /\bw[-_]?9\b/i, confidence: 0.9 },
  { type: 'board_list', re: /board[-_ ]?(list|roster|members)/i, confidence: 0.8 },
  { type: 'brand_kit', re: /brand[-_ ]?kit|style[-_ ]?guide|letterhead/i, confidence: 0.8 },
  { type: 'campaign_brief', re: /campaign[-_ ]?brief|program[-_ ]?brief/i, confidence: 0.75 },
  { type: 'impact_sample', re: /impact|annual[-_ ]?report/i, confidence: 0.7 }
];

function extOf(filename) {
  const m = String(filename || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function classify({ filename, mimeType }) {
  const name = String(filename || '');
  const mime = String(mimeType || '');
  const ext = extOf(name);

  if (PARK_MIME.has(mime) || PARK_EXT.has(ext)) {
    return { suggested_type: 'parked_crm', confidence: 1, status: 'parked_crm', classifier_version: 'v1-heuristics' };
  }

  const mimeOk = ALLOWED_MIME.has(mime) || ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.docx', '.txt'].includes(ext);
  if (!mimeOk) {
    return { suggested_type: 'uncategorized', confidence: 0, status: 'rejected', reject_reason: 'disallowed_type', classifier_version: 'v1-heuristics' };
  }

  for (const rule of RULES) {
    if (rule.re.test(name)) {
      return { suggested_type: rule.type, confidence: rule.confidence, status: 'stored', classifier_version: 'v1-heuristics' };
    }
  }
  return { suggested_type: 'uncategorized', confidence: 0, status: 'stored', classifier_version: 'v1-heuristics' };
}
