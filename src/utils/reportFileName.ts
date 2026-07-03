function sanitizeFileNamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'Unknown';
}

/** Safe download filename from Clients List + Month dropdown labels */
export function buildReportFileName(
  clientName: string,
  monthLabel: string,
  extension: 'pptx' | 'pdf',
): string {
  return `${sanitizeFileNamePart(clientName)}_Report_${sanitizeFileNamePart(monthLabel)}.${extension}`;
}
