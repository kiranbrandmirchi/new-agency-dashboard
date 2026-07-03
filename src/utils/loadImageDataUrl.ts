import { useEffect, useState } from 'react';

const LOGO_FETCH_MS = 5000;

/** Fetch a public image path and return a data URL for PptxGenJS addImage */
export async function loadImageDataUrl(src: string): Promise<string | null> {
  try {
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGO_FETCH_MS);
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function isNearWhite(r: number, g: number, b: number, threshold: number): boolean {
  return r >= threshold && g >= threshold && b >= threshold;
}

/** Flood-fill near-white pixels connected to image edges (removes JPG white box). */
function stripEdgeWhiteBackground(dataUrl: string, threshold = 238): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const visited = new Uint8Array(w * h);
        const queue: number[] = [];

        const pushIfWhite = (x: number, y: number) => {
          const idx = y * w + x;
          if (visited[idx]) return;
          const i = idx * 4;
          if (!isNearWhite(d[i], d[i + 1], d[i + 2], threshold)) return;
          visited[idx] = 1;
          queue.push(idx);
        };

        for (let x = 0; x < w; x += 1) {
          pushIfWhite(x, 0);
          pushIfWhite(x, h - 1);
        }
        for (let y = 0; y < h; y += 1) {
          pushIfWhite(0, y);
          pushIfWhite(w - 1, y);
        }

        while (queue.length) {
          const idx = queue.pop() as number;
          const i = idx * 4;
          d[i + 3] = 0;
          const x = idx % w;
          const y = (idx - x) / w;
          if (x > 0) pushIfWhite(x - 1, y);
          if (x < w - 1) pushIfWhite(x + 1, y);
          if (y > 0) pushIfWhite(x, y - 1);
          if (y < h - 1) pushIfWhite(x, y + 1);
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Logo for dark cover — keeps PNG transparency; strips white box from JPG logos. */
export async function loadLogoForDarkBackground(src: string): Promise<string | null> {
  const dataUrl = await loadImageDataUrl(src);
  if (!dataUrl) return null;
  if (/\.png(\?|#|$)/i.test(src) || dataUrl.startsWith('data:image/png')) {
    return dataUrl;
  }
  return stripEdgeWhiteBackground(dataUrl);
}

/** React hook — processed logo URL for cover preview on dark backgrounds. */
export function useLogoForDarkBackground(src: string): string {
  const [processed, setProcessed] = useState(src);
  useEffect(() => {
    let cancelled = false;
    loadLogoForDarkBackground(src).then((url) => {
      if (!cancelled && url) setProcessed(url);
    });
    return () => { cancelled = true; };
  }, [src]);
  return processed;
}
