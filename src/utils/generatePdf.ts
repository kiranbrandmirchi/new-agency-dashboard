import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { buildReportFileName } from './reportFileName';

export type GeneratePdfOptions = {
  clientName: string;
  monthLabel: string;
};

/** Capture size in CSS pixels (16:9, matches preview max-width) */
const SLIDE_PX_W = 960;
const SLIDE_PX_H = 540;
const CAPTURE_SCALE = 2;

function slideCaptureBackground(el: HTMLElement): string {
  const inner = el.querySelector('.ppt-slide-inner');
  if (inner) {
    const bg = getComputedStyle(inner).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
  }
  return el.querySelector('.ppt-cover') ? '#1a1a1a' : '#ffffff';
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Clone slide into a visible capture host on <body>.
 * Hidden/off-screen ancestors cause html2canvas to skip text — only backgrounds render.
 */
async function captureSlide(sourceEl: HTMLElement): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.className = 'ppt-pdf-capture-host';

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.classList.add('ppt-slide-card--export');
  clone.style.width = `${SLIDE_PX_W}px`;
  clone.style.height = `${SLIDE_PX_H}px`;
  clone.style.maxWidth = `${SLIDE_PX_W}px`;
  clone.style.minWidth = `${SLIDE_PX_W}px`;
  clone.style.opacity = '1';
  clone.style.transform = 'none';
  clone.style.animation = 'none';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.border = 'none';
  clone.style.borderRadius = '0';
  clone.style.containerType = 'inline-size';
  clone.querySelector('.ppt-slide-badge')?.remove();

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await waitForPaint();
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    return await html2canvas(clone, {
      scale: CAPTURE_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: slideCaptureBackground(sourceEl),
    });
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Renders slide preview DOM nodes into a multi-page landscape PDF (one slide per page).
 */
export async function generatePdf(
  slideElements: HTMLElement[],
  options: GeneratePdfOptions,
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
    const canvas = await captureSlide(slideElements[i]);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (i > 0) {
      pdf.addPage([pageW, pageH], 'landscape');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  }

  pdf.save(buildReportFileName(options.clientName, options.monthLabel, 'pdf'));
}

export { waitForPaint };
