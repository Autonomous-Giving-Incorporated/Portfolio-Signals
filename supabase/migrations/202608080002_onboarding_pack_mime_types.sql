-- Expand campaign-private MIME allowlist for Client Onboarding Pack.
-- Aligns storage.buckets.allowed_mime_types with the onboarding classifier
-- (services/onboarding-pack + upload-onboarding-document): keep pdf/png/jpeg/csv/xlsx
-- and add webp, svg, docx, txt, xls.

update storage.buckets
set allowed_mime_types = array[
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
]
where id = 'campaign-private';
