import html2canvas from 'html2canvas';

export const SLIDE_PX_W = 960;
export const SLIDE_PX_H = 540;
export const CAPTURE_SCALE = 2;

export function slideCaptureBackground(el: HTMLElement): string {
  const inner = el.querySelector('.mr-slide-inner');
  if (inner) {
    const bg = getComputedStyle(inner).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
  }
  return el.querySelector('.mr-slide-cover') ? '#1a1a1a' : '#ffffff';
}

export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Clone slide into a visible capture host on document.body for html2canvas. */
export async function captureMonthlySlide(sourceEl: HTMLElement): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.className = 'mr-slide-pdf-capture-host';

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.classList.add('mr-slide-card--export');
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
  clone.querySelector('.mr-slide-badge')?.remove();
  clone.querySelectorAll('[contenteditable]').forEach((node) => {
    (node as HTMLElement).contentEditable = 'false';
  });
  clone.querySelectorAll('input, textarea').forEach((node) => {
    const input = node as HTMLInputElement | HTMLTextAreaElement;
    if (input.tagName === 'TEXTAREA') return;
    const span = document.createElement('span');
    span.textContent = input.value;
    span.className = 'mr-slide-capture-text';
    input.parentNode?.replaceChild(span, input);
  });
  clone.querySelectorAll('textarea').forEach((node) => {
    const ta = node as HTMLTextAreaElement;
    const div = document.createElement('div');
    div.className = 'mr-slide-capture-textarea';
    div.textContent = ta.value;
    ta.parentNode?.replaceChild(div, ta);
  });

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
