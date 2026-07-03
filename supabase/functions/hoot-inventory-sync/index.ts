const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  const logs = [];
  const log = (m)=>{
    logs.push(m);
    console.log(m);
  };
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    let body = {};
    try {
      body = await req.json();
    } catch  {
      body = {};
    }
    // Optional: pass a specific client_id to sync only one dealer
    const targetClientId = body.client_id || null;
    log("=== HOOT INVENTORY SYNC ===");
    log("Target client: " + (targetClientId || "ALL active feeds"));
    // --- Fetch list of feeds to process ---
    let feedUrl = SB_URL + "/rest/v1/client_hoot_feeds?is_active=eq.true&select=id,client_id,hoot_url";
    if (targetClientId) {
      feedUrl += "&client_id=eq." + targetClientId;
    }
    const feedsRes = await fetch(feedUrl, {
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY
      }
    });
    const feeds = await feedsRes.json();
    if (!feeds || feeds.length === 0) {
      log("No active feeds found.");
      return jsonRes({
        success: true,
        message: "No feeds",
        log: logs
      });
    }
    log("Found " + feeds.length + " feed(s) to process");
    let totalUpserted = 0;
    let totalErrors = 0;
    for (const feed of feeds){
      const clientId = feed.client_id;
      const hootUrl = feed.hoot_url;
      const feedId = feed.id;
      log("\n--- Processing feed " + feedId + " for client " + clientId + " ---");
      try {
        // --- Fetch CSV ---
        const csvRes = await fetch(hootUrl);
        if (!csvRes.ok) {
          const errMsg = "HTTP " + csvRes.status + " fetching " + hootUrl;
          log("  ERROR: " + errMsg);
          await updateFeedStatus(SB_URL, SB_KEY, feedId, 0, errMsg);
          totalErrors++;
          continue;
        }
        const csvText = await csvRes.text();
        if (!csvText || csvText.trim().length === 0) {
          log("  WARN: Empty CSV response");
          await updateFeedStatus(SB_URL, SB_KEY, feedId, 0, "Empty response");
          continue;
        }
        // --- Parse CSV ---
        const rows = parseCSV(csvText);
        log("  Parsed " + rows.length + " rows");
        if (rows.length === 0) {
          await updateFeedStatus(SB_URL, SB_KEY, feedId, 0, null);
          continue;
        }
        // --- Build upsert data ---
        const upsertRows = [];
        const seenKeys = new Set();
        for (const row of rows){
          const vin = cleanStr(row["VIN"] || row["vin"]);
          const url = cleanStr(row["URL"] || row["url"] || row["Vehicle URL"] || "");
          if (!vin || !url) continue;
          // Deduplicate within same CSV
          const key = vin + "|" + url;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const condition = cleanStr(row["Condition"] || row["condition"]);
          const year = parseInt(row["Year"] || row["year"] || "0", 10) || null;
          const make = cleanStr(row["Make"] || row["make"]);
          const model = cleanStr(row["Model"] || row["model"]);
          const trimVal = cleanStr(row["Trim"] || row["trim"]);
          const color = cleanStr(row["Color"] || row["color"]);
          const priceRaw = row["Price"] || row["price"] || "";
          const price = parseFloat(String(priceRaw).replace(/[^0-9.]/g, "")) || null;
          const priceAltRaw = row["Price alt."] || row["price_alt"] || "";
          const msrp = parseFloat(String(priceAltRaw).replace(/[^0-9.]/g, "")) || null;
          const discountRaw = row["Discount"] || row["discount"] || "";
          const discount = parseFloat(String(discountRaw).replace(/[^0-9.]/g, "")) || null;
          // RV Type: different column names across platforms
          const rvType = cleanStr(row["RV Type"] || row["RV_class"] || row["rv_type"] || row["Type"] || "");
          const vehicleType = cleanStr(row["Vehicle Type"] || row["vehicle_type"] || "");
          const title = cleanStr(row["Title"] || row["title"] || row["Title orig."] || "");
          const stockNumber = cleanStr(row["stock_number"] || row["Stock Number"] || row["Stock #"] || "");
          const location = cleanStr(row["Location"] || row["location"] || "");
          const mileageRaw = row["Mileage"] || row["mileage"] || "";
          const mileage = parseFloat(String(mileageRaw).replace(/[^0-9.]/g, "")) || null;
          const imageUrl = cleanStr(row["Image URL"] || row["image_url"] || "");
          const fuelType = cleanStr(row["Fuel Type"] || row["fuel_type"] || "");
          const drivetrain = cleanStr(row["Drivetrain"] || row["drivetrain"] || "");
          const transmission = cleanStr(row["Transmission"] || row["transmission"] || "");
          const doorsRaw = row["Doors"] || row["doors"] || "";
          const doors = parseInt(String(doorsRaw), 10) || null;
          const advertiserName = cleanStr(row["Advertiser Name"] || row["advertiser_name"] || "");
          upsertRows.push({
            client_id: clientId,
            vin,
            url,
            condition,
            year,
            make,
            model,
            trim: trimVal,
            color,
            price,
            msrp,
            discount,
            rv_type: rvType,
            vehicle_type: vehicleType,
            title,
            stock_number: stockNumber,
            location,
            mileage,
            image_url: imageUrl,
            fuel_type: fuelType,
            drivetrain,
            transmission,
            doors,
            advertiser_name: advertiserName,
            last_seen_at: new Date().toISOString(),
            is_active: true
          });
        }
        log("  Valid rows to upsert: " + upsertRows.length);
        // --- Upsert in chunks ---
        let upserted = 0;
        for(let i = 0; i < upsertRows.length; i += 200){
          const chunk = upsertRows.slice(i, i + 200);
          const res = await fetch(SB_URL + "/rest/v1/hoot_inventory", {
            method: "POST",
            headers: {
              apikey: SB_KEY,
              Authorization: "Bearer " + SB_KEY,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify(chunk)
          });
          if (!res.ok) {
            const err = await res.text();
            log("  WARN upsert chunk: " + err.substring(0, 200));
          } else {
            upserted += chunk.length;
          }
        }
        log("  Upserted: " + upserted);
        totalUpserted += upserted;
        // --- Mark items NOT in this feed as inactive ---
        // (Items for this client whose last_seen_at is older than this run)
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
        await fetch(SB_URL + "/rest/v1/hoot_inventory?client_id=eq." + clientId + "&last_seen_at=lt." + cutoff + "&is_active=eq.true", {
          method: "PATCH",
          headers: {
            apikey: SB_KEY,
            Authorization: "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            is_active: false
          })
        });
        await updateFeedStatus(SB_URL, SB_KEY, feedId, upserted, null);
      } catch (e) {
        const errMsg = e.message || String(e);
        log("  ERROR: " + errMsg);
        await updateFeedStatus(SB_URL, SB_KEY, feedId, 0, errMsg);
        totalErrors++;
      }
    }
    log("\n=== DONE === Upserted: " + totalUpserted + " | Errors: " + totalErrors);
    return jsonRes({
      success: true,
      total_upserted: totalUpserted,
      total_errors: totalErrors,
      feeds_processed: feeds.length,
      log: logs
    });
  } catch (err) {
    log("FATAL: " + (err.message || String(err)));
    return jsonRes({
      error: err.message,
      log: logs
    }, 500);
  }
  function jsonRes(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
// --- Helpers ---
async function updateFeedStatus(sbUrl, sbKey, feedId, rowCount, error) {
  await fetch(sbUrl + "/rest/v1/client_hoot_feeds?id=eq." + feedId, {
    method: "PATCH",
    headers: {
      apikey: sbKey,
      Authorization: "Bearer " + sbKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      last_fetched_at: new Date().toISOString(),
      last_row_count: rowCount,
      last_error: error
    })
  });
}
function cleanStr(val) {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}
function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for(let i = 1; i < lines.length; i++){
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    for(let j = 0; j < headers.length; j++){
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }
  return rows;
}
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}
