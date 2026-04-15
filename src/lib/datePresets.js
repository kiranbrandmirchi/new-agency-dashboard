export const DATE_PRESETS = [
  { key: 'last7', label: 'Last 7 days', days: 7 },
  { key: 'last30', label: 'Last 30 days', days: 30 },
  { key: 'last90', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range', days: null },
];

export function getDateRangeFromPreset(presetKey) {
  const preset = DATE_PRESETS.find((p) => p.key === presetKey);
  if (!preset || preset.key === 'custom') return null;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (preset.days || 7));
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}
