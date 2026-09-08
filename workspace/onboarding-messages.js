// English fallback catalog for collection additions. The workspace currently has
// no global i18n framework. Runtime onboardingMessages may override these keys;
// templates are plain text, never HTML. Preserve named {placeholders} in locales.
const EN = {
  chooseFiles: 'Choose files',
  uploadLabel: 'Upload onboarding documents',
  dropHint: 'Drop files here or choose files to upload (max 25 MiB each). Press Enter or Space to choose files.',
  typesHint: 'PDF, images, DOCX, text — or CSV/XLSX (parked for list ingest, not org-proof).',
  uploadProgress: 'Upload progress',
  uploadResults: 'Upload results',
  uploading: 'Uploading {current}/{total}: {name}…',
  emptyFile: 'File is empty.',
  largeFile: 'File exceeds 25 MiB.',
  unsupportedFile: 'Unsupported file type.',
  uploaded: 'Uploaded.',
  parked: 'Stored privately; list ingest remains separate.',
  uploadFailed: 'Upload failed.',
  refreshFailed: ' Could not refresh checklist: {reason}. Reload the pack before retrying successful uploads.',
  summary: '{uploaded} uploaded · {failed} failed.{refreshError}',
  unsafePreview: 'Unsafe preview URL.',
  previewReady: 'Private preview ready. Link expires in 60 seconds.',
  openPreview: 'Open private preview'
};

export function collectionMessages(overrides = {}) {
  return (key, values = {}) => {
    const template = typeof overrides?.[key] === 'string' ? overrides[key] : EN[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
  };
}
