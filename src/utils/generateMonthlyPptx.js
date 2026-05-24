/**
 * Export monthly report as editable .pptx (monthlyPptxBuilder only).
 */
export async function generateMonthlyPptx(exportData, options) {
  const { buildEditableMonthlyPptx } = await import('./monthlyPptxBuilder');
  await buildEditableMonthlyPptx(exportData, options);
}
