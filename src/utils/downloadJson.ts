export function downloadJsonFile(filename: string, data: unknown): void {
  if (typeof window === 'undefined') return;

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const href = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(href);
}

export function buildTimestampedJsonFilename(base: string, capturedAtIso?: string): string {
  const normalizedBase = base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'payload';

  const rawIso = capturedAtIso ? new Date(capturedAtIso).toISOString() : new Date().toISOString();
  const safeTimestamp = rawIso.replace(/[:.]/g, '-');
  return `${normalizedBase}-${safeTimestamp}.json`;
}
