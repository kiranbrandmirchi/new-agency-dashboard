import { buildReportFileName } from './reportFileName';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_STORAGE_KEY = 'rcs_gdrive_access_token';
const TOKEN_EXP_STORAGE_KEY = 'rcs_gdrive_token_exp';
const SCOPE_STORAGE_KEY = 'rcs_gdrive_scope';

function clearCachedToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_EXP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function ensureScopeVersion() {
  try {
    if (sessionStorage.getItem(SCOPE_STORAGE_KEY) !== DRIVE_SCOPE) {
      clearCachedToken();
      sessionStorage.setItem(SCOPE_STORAGE_KEY, DRIVE_SCOPE);
    }
  } catch {
    /* ignore */
  }
}

function getGoogleClientId() {
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID
    || import.meta.env.VITE_GA4_CLIENT_ID
    || ''
  ).trim();
}

function getReportsFolderId() {
  return (import.meta.env.VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID || '').trim();
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.oauth2) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your network or ad blocker.'));
    document.head.appendChild(script);
  });
}

function readCachedToken() {
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_STORAGE_KEY) || 0);
    if (token && exp > Date.now() + 60_000) return token;
  } catch {
    /* private browsing */
  }
  return '';
}

function cacheToken(token, expiresInSec = 3600) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_STORAGE_KEY, String(Date.now() + expiresInSec * 1000));
  } catch {
    /* ignore */
  }
}

/** Cached token from a recent Google sign-in (no popup). */
export function getCachedGoogleDriveAccessToken() {
  return readCachedToken();
}

/** Prompt Google sign-in (shared agency account) and return a Drive access token. */
export async function requestGoogleDriveAccessToken({ forceSignIn = false } = {}) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Missing VITE_GOOGLE_CLIENT_ID in .env — use the same Web client ID from Google Cloud Console (OAuth client ID is safe to expose in the browser).',
    );
  }

  ensureScopeVersion();

  if (!forceSignIn) {
    const cached = readCachedToken();
    if (cached) return cached;
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error || 'Google sign-in cancelled'));
          return;
        }
        cacheToken(response.access_token, response.expires_in || 3600);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({
      prompt: forceSignIn || !readCachedToken() ? 'consent' : '',
    });
  });
}

async function uploadBlobToDrive(accessToken, blob, fileName, folderId, convertToSlides) {
  const metadata = {
    name: String(fileName || 'report').replace(/\.pptx$/i, ''),
  };
  if (folderId) metadata.parents = [folderId];
  if (convertToSlides) {
    metadata.mimeType = 'application/vnd.google-apps.presentation';
  }

  const boundary = `rcs_drive_${crypto.randomUUID().replace(/-/g, '')}`;
  const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${pptxMime}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--`;

  const body = new Blob([
    new TextEncoder().encode(metaPart),
    blob,
    new TextEncoder().encode(endPart),
  ]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Drive upload failed (${res.status})`;
    if (res.status === 401) {
      throw new Error(`${msg} — sign in again with your agency Google account.`);
    }
    if (res.status === 403) {
      throw new Error(
        `${msg} — ensure the signed-in account can edit the reports folder, or check VITE_GOOGLE_DRIVE_REPORTS_FOLDER_ID.`,
      );
    }
    throw new Error(msg);
  }

  return data;
}

/**
 * Frontend-only: sign in with Google (browser popup), upload .pptx, convert to Slides.
 * All staff should sign in with the same agency Google account when prompted.
 */
export async function uploadMonthlyReportToGoogleDrive({
  blob,
  clientName,
  monthLabel,
  folderId,
  accessToken: providedToken,
}) {
  const accessToken = providedToken || await requestGoogleDriveAccessToken();
  const fileName = buildReportFileName(clientName, monthLabel, 'pptx');
  const targetFolder = folderId || getReportsFolderId();

  const data = await uploadBlobToDrive(
    accessToken,
    blob,
    fileName,
    targetFolder,
    true,
  );

  return {
    fileId: data.id,
    fileName: data.name,
    webViewLink: data.webViewLink,
    folderId: targetFolder || null,
  };
}
