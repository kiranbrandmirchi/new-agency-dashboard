Deno.serve(async (req)=>{
  const L = [];
  const log = (msg)=>{
    L.push(msg);
    console.log(msg);
  };
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL");
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const DT = Deno.env.get("GADS_DEVELOPER_TOKEN") || "";
    const CI = Deno.env.get("GADS_CLIENT_ID") || "";
    const CS = Deno.env.get("GADS_CLIENT_SECRET") || "";
    const body = await req.json();
    const customerId = String(body.customer_id || "").replace(/-/g, "");
    if (!customerId) return new Response("missing customer_id", {
      status: 400
    });
    const dateFrom = body.date_from || "";
    const dateTo = body.date_to || "";
    const syncType = body.sync_type || "all";
    log("=== STATUS-GEO  customer=" + customerId + "  type=" + syncType + " ===");
    // --- Credential from database ---
    const credRes = await fetch(SB_URL + "/rest/v1/rpc/get_platform_credential", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_customer_id: customerId,
        p_platform: "google_ads"
      })
    });
    const credRows = await credRes.json();
    if (!credRows || credRows.length === 0 || !credRows[0].refresh_token) {
      log("ERROR: No credential for " + customerId);
      return new Response(L.join("\n"), {
        status: 400,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    const REFRESH_TOK = credRows[0].refresh_token;
    const MCC_ID = (credRows[0].mcc_id || "").replace(/-/g, "");
    // --- OAuth ---
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CI,
        client_secret: CS,
        refresh_token: REFRESH_TOK
      })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      log("TOKEN ERROR");
      throw new Error("no token");
    }
    log("Token OK");
    // --- Helpers ---
    async function gq(cid, query) {
      const url = "https://googleads.googleapis.com/v23/customers/" + cid + "/googleAds:searchStream";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "developer-token": DT,
          "login-customer-id": MCC_ID,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error("GAds API error: " + res.status);
      const rows = [];
      if (Array.isArray(json)) {
        for (const chunk of json){
          if (chunk.results) rows.push(...chunk.results);
        }
      }
      return rows;
    }
    function m2d(micros) {
      return (Math.round(Number(micros || 0) / 1_000_000 * 100) / 100).toFixed(2);
    }
    async function su(table, data, conflict) {
      if (!data.length) return 0;
      let total = 0;
      for(let i = 0; i < data.length; i += 400){
        const batch = data.slice(i, i + 400);
        const res = await fetch(SB_URL + "/rest/v1/" + table + "?on_conflict=" + conflict, {
          method: "POST",
          headers: {
            "apikey": SB_KEY,
            "Authorization": "Bearer " + SB_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(batch)
        });
        if (!res.ok) {
          log("   SB ERROR (" + table + "): " + (await res.text()).substring(0, 300));
        } else {
          total += batch.length;
        }
      }
      return total;
    }
    // A. Campaign Status
    if (syncType === "all" || syncType === "status" || syncType === "campaigns") {
      log("\n--- A. Campaign Status ---");
      try {
        const rows = await gq(customerId, "SELECT campaign.id, campaign.name, campaign.status, " + "campaign.advertising_channel_type, campaign.bidding_strategy_type, " + "campaign.start_date_time, campaign_budget.amount_micros, " + "campaign.serving_status FROM campaign ORDER BY campaign.id");
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: r.campaign?.name || "",
            campaign_type: r.campaign?.advertisingChannelType || "",
            campaign_status: r.campaign?.status || "",
            serving_status: r.campaign?.servingStatus || "",
            budget_amount: m2d(r.campaignBudget?.amountMicros),
            bidding_strategy_type: r.campaign?.biddingStrategyType || "",
            start_date: r.campaign?.startDateTime || "",
            synced_at: new Date().toISOString()
          }));
        const n = await su("gads_campaign_status", data, "customer_id,campaign_id");
        log("   OK: " + n);
      } catch (e) {
        log("   ERR: " + e.message);
      }
    }
    // B. Ad Group Status
    if (syncType === "all" || syncType === "status" || syncType === "adgroups") {
      log("\n--- B. Ad Group Status ---");
      try {
        const rows = await gq(customerId, "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, " + "campaign.id, campaign.name FROM ad_group ORDER BY ad_group.id");
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: r.campaign?.name || "",
            ad_group_id: String(r.adGroup?.id || ""),
            ad_group_name: r.adGroup?.name || "",
            ad_group_status: r.adGroup?.status || "",
            ad_group_type: r.adGroup?.type || "",
            synced_at: new Date().toISOString()
          }));
        const n = await su("gads_adgroup_status", data, "customer_id,ad_group_id");
        log("   OK: " + n);
      } catch (e) {
        log("   ERR: " + e.message);
      }
    }
    // C. Keyword Status
    if (syncType === "all" || syncType === "status" || syncType === "keywords") {
      log("\n--- C. Keyword Status ---");
      try {
        const rows = await gq(customerId, "SELECT ad_group_criterion.criterion_id, " + "ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, " + "ad_group_criterion.status, ad_group_criterion.approval_status, " + "ad_group_criterion.quality_info.quality_score, " + "ad_group_criterion.quality_info.search_predicted_ctr, " + "ad_group_criterion.quality_info.post_click_quality_score, " + "ad_group_criterion.quality_info.creative_quality_score, " + "ad_group_criterion.effective_cpc_bid_micros, " + "ad_group.id, ad_group.name, campaign.id, campaign.name " + "FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED' " + "ORDER BY ad_group_criterion.criterion_id");
        const data = rows.map((r)=>({
            customer_id: customerId,
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: r.campaign?.name || "",
            ad_group_id: String(r.adGroup?.id || ""),
            ad_group_name: r.adGroup?.name || "",
            keyword_id: String(r.adGroupCriterion?.criterionId || ""),
            keyword_text: r.adGroupCriterion?.keyword?.text || "",
            keyword_match_type: r.adGroupCriterion?.keyword?.matchType || "",
            keyword_status: r.adGroupCriterion?.status || "",
            approval_status: r.adGroupCriterion?.approvalStatus || "",
            quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore ?? null,
            expected_ctr: r.adGroupCriterion?.qualityInfo?.searchPredictedCtr || "",
            landing_page_experience: r.adGroupCriterion?.qualityInfo?.postClickQualityScore || "",
            ad_relevance: r.adGroupCriterion?.qualityInfo?.creativeQualityScore || "",
            bid_amount: m2d(r.adGroupCriterion?.effectiveCpcBidMicros),
            synced_at: new Date().toISOString()
          }));
        const n = await su("gads_keyword_status", data, "customer_id,ad_group_id,keyword_id");
        log("   OK: " + n);
      } catch (e) {
        log("   ERR: " + e.message);
      }
    }
    // D. Geo Data
    if (syncType === "all" || syncType === "geo") {
      log("\n--- D. Geo Data ---");
      const geoFrom = dateFrom || "2025-01-01";
      const geoTo = dateTo || "2025-12-31";
      try {
        const rows = await gq(customerId, "SELECT campaign.id, campaign.name, segments.date, " + "segments.geo_target_city, segments.geo_target_region, " + "segments.geo_target_metro, segments.geo_target_most_specific_location, " + "user_location_view.country_criterion_id, " + "metrics.impressions, metrics.clicks, metrics.cost_micros, " + "metrics.conversions, metrics.conversions_value, " + "metrics.all_conversions, metrics.ctr, metrics.average_cpc " + "FROM user_location_view " + "WHERE segments.date BETWEEN '" + geoFrom + "' AND '" + geoTo + "' " + "AND metrics.impressions > 0");
        const geoId = (v)=>{
          if (!v) return "";
          const parts = v.split("/");
          return parts[parts.length - 1] || "";
        };
        const seen = new Map();
        for (const r of rows){
          const row = {
            customer_id: customerId,
            campaign_id: String(r.campaign?.id || ""),
            campaign_name: r.campaign?.name || "",
            date: r.segments?.date || "",
            country: String(r.userLocationView?.countryCriterionId || ""),
            region: geoId(r.segments?.geoTargetRegion),
            city: geoId(r.segments?.geoTargetCity),
            metro: geoId(r.segments?.geoTargetMetro),
            most_specific: geoId(r.segments?.geoTargetMostSpecificLocation),
            impressions: Number(r.metrics?.impressions || 0),
            clicks: Number(r.metrics?.clicks || 0),
            cost: m2d(r.metrics?.costMicros),
            conversions: Number(r.metrics?.conversions || 0).toFixed(2),
            conversions_value: Number(r.metrics?.conversionsValue || 0).toFixed(2),
            all_conversions: Number(r.metrics?.allConversions || 0).toFixed(2),
            ctr: (Number(r.metrics?.ctr || 0) * 100).toFixed(4),
            avg_cpc: m2d(r.metrics?.averageCpc),
            synced_at: new Date().toISOString()
          };
          const key = [
            row.customer_id,
            row.campaign_id,
            row.country,
            row.region,
            row.city,
            row.most_specific,
            row.date
          ].join("|");
          if (!seen.has(key)) {
            seen.set(key, row);
          } else {
            const ex = seen.get(key);
            ex.impressions += row.impressions;
            ex.clicks += row.clicks;
            ex.cost = (parseFloat(ex.cost) + parseFloat(row.cost)).toFixed(2);
            ex.conversions = (parseFloat(ex.conversions) + parseFloat(row.conversions)).toFixed(2);
            ex.conversions_value = (parseFloat(ex.conversions_value) + parseFloat(row.conversions_value)).toFixed(2);
            ex.all_conversions = (parseFloat(ex.all_conversions) + parseFloat(row.all_conversions)).toFixed(2);
            ex.ctr = ex.impressions > 0 ? (ex.clicks / ex.impressions * 100).toFixed(4) : "0.0000";
            ex.avg_cpc = ex.clicks > 0 ? (parseFloat(ex.cost) / ex.clicks).toFixed(2) : "0.00";
          }
        }
        const data = Array.from(seen.values());
        log("   Deduped: " + data.length);
        const n = await su("gads_geo_location_daily", data, "customer_id,campaign_id,country,region,city,most_specific,date");
        log("   OK: " + n);
      } catch (e) {
        log("   GEO ERR: " + e.message);
      }
    }
    log("\n=== DONE ===");
    return new Response(L.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  } catch (e) {
    log("FATAL: " + e.message);
    return new Response(L.join("\n") + "\nFATAL: " + e.message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
});
