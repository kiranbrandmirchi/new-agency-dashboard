import { useEffect, useState } from 'react';

const LOGO_FETCH_MS = 5000;
const ALPHA_TRIM_THRESHOLD = 10;

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

/** Light accent blue from logo swoosh or JPG compression fringe at canvas edges. */
function isStrayBluePixel(r: number, g: number, b: number, a: number): boolean {
  if (a < ALPHA_TRIM_THRESHOLD) return false;
  return b >= 90 && b > r + 8 && b >= g - 8;
}

function readPixel(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/** Peel thin blue/noise columns from left/right edges (fixes vertical blue line in logo assets). */
function peelEdgeArtifactColumns(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  side: 'left' | 'right',
  maxPeel = 12,
): number {
  let peeled = 0;
  while (peeled < maxPeel) {
    const x = side === 'right' ? w - 1 - peeled : peeled;
    if (x < 0 || x >= w) break;

    let opaque = 0;
    let strayBlue = 0;
    for (let y = 0; y < h; y += 1) {
      const { r, g, b, a } = readPixel(data, w, x, y);
      if (a > ALPHA_TRIM_THRESHOLD) {
        opaque += 1;
        if (isStrayBluePixel(r, g, b, a)) strayBlue += 1;
      }
    }

    const isEmpty = opaque === 0;
    const isThinBlueLine = opaque > 0 && strayBlue / opaque >= 0.45;
    const isSparseNoise = opaque > 0 && opaque <= 6 && strayBlue >= Math.ceil(opaque * 0.4);

    if (!isEmpty && !isThinBlueLine && !isSparseNoise) break;

    for (let y = 0; y < h; y += 1) {
      const i = (y * w + x) * 4;
      data[i + 3] = 0;
    }
    peeled += 1;
  }
  return peeled;
}

function cleanLogoCanvas(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        peelEdgeArtifactColumns(imageData.data, w, h, 'right');
        peelEdgeArtifactColumns(imageData.data, w, h, 'left', 4);
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

/** Crop canvas to non-transparent pixel bounds (removes padding and stray edge artifacts). */
function trimToContentBounds(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha > ALPHA_TRIM_THRESHOLD) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < minX || maxY < minY) {
          resolve(dataUrl);
          return;
        }

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cropW;
        out.height = cropH;
        const outCtx = out.getContext('2d');
        if (!outCtx) {
          resolve(dataUrl);
          return;
        }
        outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Natural pixel dimensions of a data URL image. */
export function getDataUrlImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
      });
    };
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

/** Fit image into a max box preserving aspect ratio. */
export function fitInBox(
  natW: number,
  natH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (!natW || !natH) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / natW, maxH / natH);
  return { w: natW * scale, h: natH * scale };
}

/** Logo for dark cover — strips JPG white box, removes edge artifacts, trims padding. */
export async function loadLogoForDarkBackground(src: string): Promise<string | null> {
  const dataUrl = await loadImageDataUrl(src);
  if (!dataUrl) return null;
  const isPng = /\.png(\?|#|$)/i.test(src) || dataUrl.startsWith('data:image/png');
  const stripped = isPng ? dataUrl : await stripEdgeWhiteBackground(dataUrl);
  const cleaned = await cleanLogoCanvas(stripped);
  return trimToContentBounds(cleaned);
}

/** React hook — processed logo URL for cover preview on dark backgrounds. */
export function useLogoForDarkBackground(src: string): string {
  const [processed, setProcessed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setProcessed(null);
    loadLogoForDarkBackground(src).then((url) => {
      if (!cancelled && url) setProcessed(url);
    });
    return () => { cancelled = true; };
  }, [src]);
  return processed ?? src;
}
