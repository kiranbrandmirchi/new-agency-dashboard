import { jsPDF } from 'jspdf';
import { buildReportFileName } from './reportFileName';
import { CAPTURE_SCALE, SLIDE_PX_H, SLIDE_PX_W, captureMonthlySlide, waitForPaint } from './monthlySlideCapture';

export type GenerateMonthlyPdfOptions = {
  clientName: string;
  monthLabel: string;
};

export async function generateMonthlyPdf(
  slideElements: HTMLElement[],
  options: GenerateMonthlyPdfOptions,
): Promise<void> {
  if (!slideElements.length) {
    throw new Error('No slides available to export');
  }

  const pageW = SLIDE_PX_W * CAPTURE_SCALE;
  const pageH = SLIDE_PX_H * CAPTURE_SCALE;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [pageW, pageH],
    compress: true,
  });

  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureMonthlySlide(slideElements[i]);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (i > 0) {
      pdf.addPage([pageW, pageH], 'landscape');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  }

  pdf.save(buildReportFileName(options.clientName, options.monthLabel, 'pdf'));
}

export { waitForPaint };
