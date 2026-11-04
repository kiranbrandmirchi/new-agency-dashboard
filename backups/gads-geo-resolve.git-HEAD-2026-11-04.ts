Deno.serve(async (req)=>{
  const L = [];
  const log = (msg)=>{
    L.push(msg);
    console.log(msg);
  };
  try {
    const DT = Deno.env.get("GADS_DEVELOPER_TOKEN") || "";
    const CI = Deno.env.get("GADS_CLIENT_ID") || "";
    const CS = Deno.env.get("GADS_CLIENT_SECRET") || "";
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    log("=== GEO RESOLVE ===");
    // Get ANY active Google Ads credential (geo constants are global)
    const credRes = await fetch(SB_URL + "/rest/v1/agency_platform_credentials?" + "platform=eq.google_ads&is_active=eq.true&limit=1" + "&select=oauth_refresh_token,platform_mcc_id", {
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY
      }
    });
    const creds = await credRes.json();
    if (!creds || creds.length === 0 || !creds[0].oauth_refresh_token) {
      log("ERROR: No active Google Ads credential");
      return new Response(L.join("\n"), {
        status: 400,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    const REFRESH_TOK = creds[0].oauth_refresh_token;
    const MCC = (creds[0].platform_mcc_id || "").replace(/-/g, "");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: CI,
        client_secret: CS,
        refresh_token: REFRESH_TOK,
        grant_type: "refresh_token"
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      log("ERROR: OAuth failed");
      return new Response(L.join("\n"), {
        status: 400,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    const TOKEN = tokenData.access_token;
    log("Token OK, MCC: " + MCC);
    async function gq(cid, query) {
      const res = await fetch("https://googleads.googleapis.com/v23/customers/" + cid + "/googleAds:searchStream", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + TOKEN,
          "developer-token": DT,
          "login-customer-id": MCC,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query
        })
      });
      if (!res.ok) throw new Error("GAds " + res.status + ": " + (await res.text()).substring(0, 300));
      const json = await res.json();
      const rows = [];
      if (Array.isArray(json)) json.forEach((b)=>{
        if (b.results) rows.push(...b.results);
      });
      return rows;
    }
    const missingRes = await fetch(SB_URL + "/rest/v1/rpc/get_missing_geo_ids", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    let missingIds = [];
    if (missingRes.ok) {
      const data = await missingRes.json();
      if (Array.isArray(data)) {
        missingIds = data.map((r)=>typeof r === "string" ? r : String(r));
      }
    }
    log("Missing geo IDs: " + missingIds.length);
    if (missingIds.length === 0) {
      log("Nothing to resolve");
      return new Response(L.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    let totalResolved = 0;
    for(let i = 0; i < missingIds.length; i += 500){
      const batch = missingIds.slice(i, i + 500);
      const rn = batch.map((id)=>"'geoTargetConstants/" + id + "'").join(",");
      const rows = await gq(MCC, "SELECT geo_target_constant.id, geo_target_constant.name, " + "geo_target_constant.country_code, geo_target_constant.target_type, " + "geo_target_constant.canonical_name " + "FROM geo_target_constant WHERE geo_target_constant.resource_name IN (" + rn + ")");
      const geoData = rows.map((r)=>({
          geo_id: String(r.geoTargetConstant?.id || ""),
          geo_name: r.geoTargetConstant?.name || "",
          canonical_name: r.geoTargetConstant?.canonicalName || "",
          country_code: r.geoTargetConstant?.countryCode || "",
          target_type: r.geoTargetConstant?.targetType || "",
          synced_at: new Date().toISOString()
        }));
      if (geoData.length > 0) {
        const uRes = await fetch(SB_URL + "/rest/v1/gads_geo_constants?on_conflict=geo_id", {
          method: "POST",
          headers: {
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(geoData)
        });
        if (uRes.ok) totalResolved += geoData.length;
      }
      log("  Batch " + (Math.floor(i / 500) + 1) + ": " + rows.length + " resolved");
    }
    log("Total resolved: " + totalResolved);
    return new Response(L.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  } catch (err) {
    log("FATAL: " + (err.message || String(err)));
    return new Response(L.join("\n"), {
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
});
