import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sbGet(url: string, key: string, path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const GA_CID = Deno.env.get("GA4_CLIENT_ID") || "";
    const GA_SECRET = Deno.env.get("GA4_CLIENT_SECRET") || "";
    const DEFAULT_FOLDER_ID = Deno.env.get("GOOGLE_DRIVE_REPORTS_FOLDER_ID") || "";

    if (!GA_CID || !GA_SECRET) {
      return jsonRes({ error: "Google OAuth credentials not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const sb = createClient(SB_URL, SB_KEY);
    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return jsonRes({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const {
      agency_id,
      client_id,
      file_name,
      file_base64,
      folder_id,
      convert_to_slides = true,
    } = body;

    if (!file_name || !file_base64) {
      return jsonRes({ error: "file_name and file_base64 required" }, 400);
    }

    let resolvedAgencyId = agency_id || "";
    let credentialId = "";

    if (client_id) {
      const accounts = await sbGet(
        SB_URL,
        SB_KEY,
        `client_platform_accounts?client_id=eq.${client_id}&platform=eq.ga4&is_active=eq.true&select=agency_id,credential_id&limit=1`,
      );
      if (accounts?.[0]) {
        resolvedAgencyId = resolvedAgencyId || accounts[0].agency_id || "";
        credentialId = accounts[0].credential_id || "";
      }
    }

    if (!credentialId && resolvedAgencyId) {
      const creds = await sbGet(
        SB_URL,
        SB_KEY,
        `agency_platform_credentials?agency_id=eq.${resolvedAgencyId}&platform=eq.ga4&is_active=eq.true&select=id&limit=1`,
      );
      credentialId = creds?.[0]?.id || "";
    }

    if (!credentialId) {
      return jsonRes({
        error: "No Google (GA4) credential found. Connect Google in Settings first.",
      }, 400);
    }

    const agencyCreds = await sbGet(
      SB_URL,
      SB_KEY,
      `agency_platform_credentials?id=eq.${credentialId}&is_active=eq.true&select=oauth_refresh_token`,
    );
    if (!agencyCreds?.[0]?.oauth_refresh_token) {
      return jsonRes({ error: "Google refresh token missing — reconnect GA4 in Settings" }, 400);
    }

    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GA_CID,
        client_secret: GA_SECRET,
        refresh_token: agencyCreds[0].oauth_refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokRes.json();
    if (!tokenData.access_token) {
      return jsonRes({
        error: "Google OAuth failed",
        detail: tokenData.error_description || tokenData.error || "unknown",
        hint: "Reconnect Google in Settings — Drive scope may require re-authorization.",
      }, 500);
    }

    const targetFolderId = folder_id || DEFAULT_FOLDER_ID;
    const metadata: Record<string, unknown> = { name: file_name };
    if (targetFolderId) metadata.parents = [targetFolderId];
    if (convert_to_slides) {
      metadata.mimeType = "application/vnd.google-apps.presentation";
    }

    const binary = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    const boundary = "drive_upload_" + crypto.randomUUID().replace(/-/g, "");
    const mimeType =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    const metaPart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const endPart = `\r\n--${boundary}--`;

    const bodyParts = [
      new TextEncoder().encode(metaPart),
      binary,
      new TextEncoder().encode(endPart),
    ];
    const uploadBody = new Blob(bodyParts);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: uploadBody,
      },
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      return jsonRes({
        error: "Google Drive upload failed",
        detail: uploadData.error?.message || JSON.stringify(uploadData),
        hint: uploadData.error?.code === 403
          ? "Reconnect Google in Settings to grant Drive access (drive.file scope)."
          : undefined,
      }, uploadRes.status);
    }

    return jsonRes({
      success: true,
      file_id: uploadData.id,
      file_name: uploadData.name,
      web_view_link: uploadData.webViewLink,
      mime_type: uploadData.mimeType,
      folder_id: targetFolderId || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonRes({ error: msg }, 500);
  }
});
