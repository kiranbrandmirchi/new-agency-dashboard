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
