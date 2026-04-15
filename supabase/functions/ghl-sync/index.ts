const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const log = [];
  const L = (m)=>{
    log.push(m);
    console.log(m);
  };
  const jsonRes = (b, s = 200)=>new Response(JSON.stringify(b), {
      status: s,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  const sbHeaders = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json"
  };
  async function sbGet(path) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      headers: sbHeaders
    });
    return r.json();
  }
  async function sbUpsertChunked(table, rows, conflict) {
    if (!rows.length) return;
    const CHUNK = 200;
    for(let i = 0; i < rows.length; i += CHUNK){
      const chunk = rows.slice(i, i + CHUNK);
      const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
        method: "POST",
        headers: {
          ...sbHeaders,
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(chunk)
      });
      if (!r.ok) {
        const t = await r.text();
        L(`⚠ Upsert ${table} [${i}–${i + chunk.length}]: ${r.status} ${t.substring(0, 300)}`);
      }
    }
  }
  async function ghlFetch(url, apiKey, version = "2021-04-15") {
    for(let attempt = 0; attempt < 3; attempt++){
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: version,
          Accept: "application/json"
        }
      });
      if (r.status === 429) {
        const w = parseInt(r.headers.get("retry-after") || "5", 10) * 1000;
        L(`⏳ Rate limited, waiting ${w}ms`);
        await new Promise((s)=>setTimeout(s, w));
        continue;
      }
      if (!r.ok) {
        L(`⚠ GHL ${r.status}: ${(await r.text()).substring(0, 200)}`);
        return null;
      }
      return r.json();
    }
    return null;
  }
  function safeDate(val) {
    if (!val) return new Date().toISOString();
    if (typeof val === "number" || /^\d{10,13}$/.test(String(val))) {
      const n = Number(val);
      return new Date(n > 9999999999 ? n : n * 1000).toISOString();
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  function extractMessages(data) {
    if (!data) return [];
    if (data.messages?.messages && Array.isArray(data.messages.messages)) return data.messages.messages;
    if (Array.isArray(data.messages)) return data.messages;
    if (Array.isArray(data)) return data;
    return [];
  }
  function extractAttribution(c) {
    const attr = c.attributionSource || {};
    const sessionSource = (attr.sessionSource || "").toLowerCase();
    const utmSource = attr.utmSource || "";
    const utmMedium = attr.utmMedium || "";
    const utmCampaign = attr.utmCampaign || "";
    const gclid = attr.gclid || "";
    const fbclid = attr.fbclid || "";
    const referrer = attr.referrer || "";
    const campaign = attr.campaign || utmCampaign || "";
    let channel = "Direct";
    let source = utmSource;
    let medium = utmMedium;
    if (gclid || sessionSource === "paid search") {
      channel = "Paid Search";
      source = source || "google";
      medium = medium || "cpc";
    } else if (fbclid || sessionSource === "paid social") {
      channel = "Paid Social";
      source = source || "facebook";
      medium = medium || "paid_social";
    } else if (sessionSource === "organic search") {
      channel = "Organic Search";
      source = source || (referrer.includes("google") ? "google" : referrer.includes("bing") ? "bing" : referrer.includes("yahoo") ? "yahoo" : referrer.includes("duckduckgo") ? "duckduckgo" : "organic");
      medium = medium || "organic";
    } else if (sessionSource === "referral") {
      channel = "Referral";
      medium = medium || "referral";
      if (!source && referrer) {
        try {
          source = new URL(referrer).hostname;
        } catch  {
          source = referrer;
        }
      }
    } else if (sessionSource === "direct traffic") {
      channel = "Direct";
      medium = medium || "direct";
    } else if (sessionSource === "other") {
      channel = "Other";
    }
    let leadType = "organic";
    if (channel === "Paid Search") leadType = "google_ads";
    else if (channel === "Paid Social") leadType = "social";
    else if (channel === "Organic Search") leadType = "organic";
    else if (channel === "Referral") leadType = "referral";
    else if (channel === "Direct") leadType = "direct";
    return {
      source,
      medium,
      campaign,
      leadType,
      channel
    };
  }
  try {
    const { customer_id, mode = "full" } = await req.json();
    if (!customer_id) return jsonRes({
      error: "customer_id required"
    }, 400);
    L("=== GHL SYNC V11 (real attribution) ===");
    L(`Mode: ${mode} | location: ${customer_id}`);
    const accounts = await sbGet(`client_platform_accounts?platform=eq.ghl&platform_customer_id=eq.${customer_id}&select=*&limit=1`);
    if (!accounts?.length) return jsonRes({
      error: "GHL account not found"
    }, 404);
    const acct = accounts[0];
    const apiKey = acct.platform_api_key;
    const agencyId = acct.agency_id;
    if (!apiKey) return jsonRes({
      error: "No API key"
    }, 400);
    L(`API key found | agency: ${agencyId}`);
    // ── HIPAA CHECK: skip API sync entirely ──────────────────
    if (acct.hipaa_compliant === true) {
      L("🔒 HIPAA account detected – skipping API sync. Use CSV upload for this account.");
      return jsonRes({
        success: true,
        skipped: true,
        reason: "HIPAA compliant account – data must be uploaded via CSV, not synced via API.",
        location_id: customer_id,
        log
      });
    }
    // ─────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    // ════════════════════════════════════════════════
    // PART 1: CONTACTS
    // ════════════════════════════════════════════════
    L("── Part 1: Contacts ──");
    const allContacts = [];
    let cPage = 1;
    const PL = 100;
    while(true){
      const resp = await fetch("https://services.leadconnectorhq.com/contacts/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          locationId: customer_id,
          page: cPage,
          pageLimit: PL
        })
      });
      if (!resp.ok) {
        L(`⚠ Contacts page ${cPage}: ${resp.status}`);
        break;
      }
      const data = await resp.json();
      const contacts = data.contacts || [];
      if (!contacts.length) break;
      for (const c of contacts){
        const a = extractAttribution(c);
        allContacts.push({
          id: c.id,
          location_id: customer_id,
          first_name: c.firstName || null,
          last_name: c.lastName || null,
          name: c.contactName || c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || null,
          email: c.email || null,
          phone: c.phone || null,
          tags: c.tags || [],
          source: a.source || null,
          medium: a.medium || null,
          campaign: a.campaign || null,
          lead_type: a.leadType,
          date_added: safeDate(c.dateAdded || c.createdAt),
          date_updated: safeDate(c.dateUpdated || c.updatedAt),
          last_activity: safeDate(c.lastActivity),
          opp_status: c.opportunities?.[0]?.status || null,
          opp_value: c.opportunities?.[0]?.monetaryValue || 0,
          raw_data: c,
          synced_at: now
        });
      }
      L(`  Page ${cPage}: ${contacts.length}`);
      cPage++;
      if (contacts.length < PL) break;
      await new Promise((s)=>setTimeout(s, 100));
    }
    L(`Contacts fetched: ${allContacts.length}`);
    await sbUpsertChunked("ghl_contacts", allContacts, "id");
    L(`✓ Contacts upserted`);
    const contactFirstDate = {};
    const contactInfo = {};
    for (const c of allContacts){
      contactFirstDate[c.id] = c.date_added;
      contactInfo[c.id] = {
        name: c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim(),
        phone: c.phone || "",
        email: c.email || "",
        source: c.source || "",
        medium: c.medium || "",
        campaign: c.campaign || ""
      };
    }
    const leadsByDT = {};
    for (const c of allContacts){
      const d = c.date_added.substring(0, 10);
      const key = `${d}|${c.lead_type}`;
      if (!leadsByDT[key]) {
        leadsByDT[key] = {
          location_id: customer_id,
          report_date: d,
          lead_type: c.lead_type,
          total_leads: 0,
          synced_at: now
        };
      }
      leadsByDT[key].total_leads++;
    }
    const leadsRows = Object.values(leadsByDT);
    await sbUpsertChunked("ghl_leads_daily", leadsRows, "location_id,report_date,lead_type");
    L(`✓ Leads daily: ${leadsRows.length} rows`);
    // ════════════════════════════════════════════════
    // PART 2: CALLS
    // ════════════════════════════════════════════════
    L("── Part 2: Calls ──");
    const callMap = new Map();
    let exportCursor;
    let exportWorked = false;
    while(true){
      let url = `https://services.leadconnectorhq.com/conversations/messages/export?locationId=${customer_id}&channel=Call&limit=100`;
      if (exportCursor) url += `&cursor=${exportCursor}`;
      const data = await ghlFetch(url, apiKey);
      if (!data || data.statusCode === 400 || data.statusCode === 401) {
        if (!exportWorked) L("  Export unavailable, using fallback");
        break;
      }
      const msgs = data.messages || [];
      if (!msgs.length && !exportWorked) {
        L("  Export empty, using fallback");
        break;
      }
      exportWorked = true;
      for (const msg of msgs){
        const cid = msg.contactId || "";
        const ci = contactInfo[cid] || {
          name: "",
          phone: "",
          email: "",
          source: "",
          medium: "",
          campaign: ""
        };
        const fd = contactFirstDate[cid];
        const msgDate = safeDate(msg.dateAdded);
        const isFirst = fd ? msgDate.substring(0, 10) === fd.substring(0, 10) : false;
        const dur = parseInt(msg.meta?.call?.duration ?? msg.meta?.callDuration ?? 0) || 0;
        let st = msg.meta?.call?.status || msg.status || "unknown";
        if (st === "completed") st = "answered";
        callMap.set(msg.id, {
          id: msg.id,
          location_id: customer_id,
          contact_id: cid,
          contact_name: ci.name || null,
          contact_phone: ci.phone || msg.phone || msg.from || msg.to || null,
          contact_email: ci.email || null,
          direction: msg.direction || "inbound",
          status: st,
          duration: dur,
          first_time: isFirst,
          date_added: msgDate,
          conversation_id: msg.conversationId || null,
          message_type: msg.messageType || msg.type || "TYPE_CALL",
          source: ci.source || null,
          medium: ci.medium || null,
          synced_at: now
        });
      }
      L(`  Export batch: ${msgs.length} (unique: ${callMap.size})`);
      if (!data.nextCursor) break;
      exportCursor = data.nextCursor;
      await new Promise((s)=>setTimeout(s, 100));
    }
    if (!exportWorked) {
      L("  Fallback: conversation search...");
      for (const cType of [
        "TYPE_CALL",
        "TYPE_IVR_CALL"
      ]){
        let cursor;
        while(true){
          let url = `https://services.leadconnectorhq.com/conversations/search?locationId=${customer_id}&limit=50&lastMessageType=${cType}&sort=desc&sortBy=last_message_date`;
          if (cursor) url += `&startAfterDate=${cursor}`;
          const cData = await ghlFetch(url, apiKey);
          if (!cData) break;
          const convs = cData.conversations || [];
          if (!convs.length) break;
          for (const conv of convs){
            if (callMap.has(conv.id)) continue;
            const cid = conv.contactId || "";
            const ci = contactInfo[cid] || {
              name: "",
              phone: "",
              email: "",
              source: "",
              medium: "",
              campaign: ""
            };
            const fd = contactFirstDate[cid];
            const convDate = safeDate(conv.lastMessageDate);
            const isFirst = fd ? convDate.substring(0, 10) === fd.substring(0, 10) : false;
            let dur = 0;
            let st = "answered";
            const mUrl = `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?type=TYPE_CALL&limit=1`;
            const mData = await ghlFetch(mUrl, apiKey);
            const msgs = extractMessages(mData);
            if (msgs.length) {
              const m = msgs[0];
              dur = parseInt(m.meta?.call?.duration ?? 0) || 0;
              st = m.meta?.call?.status || m.status || "answered";
              if (st === "completed") st = "answered";
            }
            callMap.set(conv.id, {
              id: conv.id,
              location_id: customer_id,
              contact_id: cid,
              contact_name: conv.contactName || ci.name || null,
              contact_phone: conv.phone || ci.phone || null,
              contact_email: ci.email || null,
              direction: conv.lastMessageDirection || "inbound",
              status: st,
              duration: dur,
              first_time: isFirst,
              date_added: convDate,
              conversation_id: conv.id,
              message_type: cType,
              source: ci.source || null,
              medium: ci.medium || null,
              synced_at: now
            });
          }
          const last = convs[convs.length - 1];
          const sv = last.sort?.[0] || new Date(last.lastMessageDate || 0).getTime();
          if (!sv || convs.length < 50) break;
          cursor = sv;
          await new Promise((s)=>setTimeout(s, 150));
        }
      }
    }
    const uniqueCalls = [
      ...callMap.values()
    ];
    L(`Total unique calls: ${uniqueCalls.length}`);
    await sbUpsertChunked("ghl_calls", uniqueCalls, "id");
    L(`✓ Calls upserted`);
    // ════════════════════════════════════════════════
    // PART 3: FORMS
    // ════════════════════════════════════════════════
    L("── Part 3: Forms ──");
    const formMap = new Map();
    const formsListData = await ghlFetch(`https://services.leadconnectorhq.com/forms/?locationId=${customer_id}&limit=50`, apiKey, "2021-07-28");
    const formsList = formsListData?.forms || [];
    L(`  Found ${formsList.length} forms`);
    for (const form of formsList){
      let page = 1;
      while(true){
        const subData = await ghlFetch(`https://services.leadconnectorhq.com/forms/submissions?locationId=${customer_id}&formId=${form.id}&page=${page}&limit=100&startAt=2020-01-01`, apiKey, "2021-07-28");
        if (!subData) break;
        const subs = subData.submissions || [];
        if (!subs.length) break;
        for (const sub of subs){
          const cid = sub.contactId || "";
          const ci = contactInfo[cid] || {
            name: "",
            phone: "",
            email: "",
            source: "",
            medium: "",
            campaign: ""
          };
          const fd = contactFirstDate[cid];
          const subDate = safeDate(sub.createdAt);
          const isFirst = fd ? subDate.substring(0, 10) === fd.substring(0, 10) : false;
          formMap.set(sub.id, {
            id: sub.id,
            location_id: customer_id,
            contact_id: cid,
            contact_name: sub.name || ci.name || null,
            contact_email: sub.email || ci.email || null,
            contact_phone: ci.phone || null,
            form_type: "form_submission",
            form_name: form.name || null,
            form_id: form.id,
            message_body: sub.others ? JSON.stringify(sub.others).substring(0, 1000) : null,
            page_url: sub.others?.eventData?.page?.url || null,
            first_time: isFirst,
            date_added: subDate,
            source: ci.source || sub.others?.eventData?.source || null,
            medium: ci.medium || sub.others?.eventData?.medium || null,
            direction: "inbound",
            conversation_id: null,
            message_type: "TYPE_FORM_SUBMISSION",
            synced_at: now
          });
        }
        L(`  "${form.name}": page ${page} → ${subs.length} subs`);
        const meta = subData.meta || {};
        if (!meta.nextPage) break;
        page++;
        await new Promise((s)=>setTimeout(s, 100));
      }
    }
    const chatTypes = {
      TYPE_WEBCHAT: "chat_widget",
      TYPE_LIVE_CHAT: "live_chat",
      TYPE_FACEBOOK: "facebook",
      TYPE_INSTAGRAM: "instagram"
    };
    for (const [cType, fType] of Object.entries(chatTypes)){
      let cursor;
      let tt = 0;
      while(true){
        let url = `https://services.leadconnectorhq.com/conversations/search?locationId=${customer_id}&limit=50&lastMessageType=${cType}&sort=desc&sortBy=last_message_date`;
        if (cursor) url += `&startAfterDate=${cursor}`;
        const cData = await ghlFetch(url, apiKey);
        if (!cData) break;
        const convs = cData.conversations || [];
        if (!convs.length) break;
        for (const conv of convs){
          if (formMap.has(conv.id)) continue;
          const cid = conv.contactId || "";
          const ci = contactInfo[cid] || {
            name: "",
            phone: "",
            email: "",
            source: "",
            medium: "",
            campaign: ""
          };
          const fd = contactFirstDate[cid];
          const convDate = safeDate(conv.lastMessageDate);
          const isFirst = fd ? convDate.substring(0, 10) === fd.substring(0, 10) : false;
          formMap.set(conv.id, {
            id: conv.id,
            location_id: customer_id,
            contact_id: cid,
            contact_name: conv.contactName || ci.name || null,
            contact_email: ci.email || null,
            contact_phone: conv.phone || ci.phone || null,
            form_type: fType,
            form_name: null,
            form_id: null,
            message_body: conv.lastMessageBody?.substring(0, 1000) || null,
            page_url: null,
            first_time: isFirst,
            date_added: convDate,
            source: ci.source || null,
            medium: ci.medium || null,
            direction: "inbound",
            conversation_id: conv.id,
            message_type: cType,
            synced_at: now
          });
          tt++;
        }
        const last = convs[convs.length - 1];
        const sv = last.sort?.[0] || new Date(last.lastMessageDate || 0).getTime();
        if (!sv || convs.length < 50) break;
        cursor = sv;
        await new Promise((s)=>setTimeout(s, 100));
      }
      if (tt) L(`  ${cType}: ${tt}`);
    }
    let chatWidgetAdded = 0;
    for (const c of allContacts){
      const ghlSrc = (c.raw_data?.source || "").toLowerCase();
      if (ghlSrc === "chat widget" || ghlSrc === "chat_widget" || ghlSrc === "webchat") {
        const key = `widget-${c.id}`;
        let alreadyExists = false;
        for (const [, v] of formMap){
          if (v.contact_id === c.id) {
            alreadyExists = true;
            break;
          }
        }
        if (!alreadyExists) {
          formMap.set(key, {
            id: key,
            location_id: customer_id,
            contact_id: c.id,
            contact_name: c.name || null,
            contact_email: c.email || null,
            contact_phone: c.phone || null,
            form_type: "chat_widget",
            form_name: "Widget Form",
            form_id: null,
            message_body: null,
            page_url: null,
            first_time: true,
            date_added: c.date_added,
            source: c.source || null,
            medium: c.medium || null,
            direction: "inbound",
            conversation_id: null,
            message_type: "TYPE_LIVE_CHAT",
            synced_at: now
          });
          chatWidgetAdded++;
        }
      }
    }
    if (chatWidgetAdded) L(`  Chat widget from contacts: ${chatWidgetAdded}`);
    const uniqueForms = [
      ...formMap.values()
    ];
    L(`Total unique forms: ${uniqueForms.length}`);
    await sbUpsertChunked("ghl_form_submissions", uniqueForms, "id");
    L(`✓ Forms upserted`);
    // ════════════════════════════════════════════════
    // PART 4: ACTIVITY DAILY
    // ════════════════════════════════════════════════
    L("── Part 4: Activity ──");
    const actMap = {};
    for (const call of uniqueCalls){
      const d = call.date_added.substring(0, 10);
      const key = `${d}|call_${call.direction}|${call.status}`;
      if (!actMap[key]) {
        actMap[key] = {
          location_id: customer_id,
          report_date: d,
          activity_type: `call_${call.direction}`,
          subtype: call.status,
          total_count: 0,
          first_time_count: 0,
          total_duration: 0,
          synced_at: now
        };
      }
      actMap[key].total_count++;
      if (call.first_time) actMap[key].first_time_count++;
      actMap[key].total_duration += call.duration || 0;
    }
    for (const form of uniqueForms){
      const d = form.date_added.substring(0, 10);
      const key = `${d}|form|${form.form_type}`;
      if (!actMap[key]) {
        actMap[key] = {
          location_id: customer_id,
          report_date: d,
          activity_type: "form",
          subtype: form.form_type,
          total_count: 0,
          first_time_count: 0,
          total_duration: 0,
          synced_at: now
        };
      }
      actMap[key].total_count++;
      if (form.first_time) actMap[key].first_time_count++;
    }
    const actRows = Object.values(actMap);
    L(`Activity rows: ${actRows.length}`);
    await sbUpsertChunked("ghl_activity_daily", actRows, "location_id,report_date,activity_type,subtype");
    L(`✓ Activity upserted`);
    // ════════════════════════════════════════════════
    // PART 5: UPDATE SYNC STATUS
    // ════════════════════════════════════════════════
    const total = allContacts.length + uniqueCalls.length + uniqueForms.length;
    await fetch(`${SB_URL}/rest/v1/client_platform_accounts?platform=eq.ghl&platform_customer_id=eq.${customer_id}`, {
      method: "PATCH",
      headers: {
        ...sbHeaders,
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_sync_at: now,
        sync_status: "success"
      })
    });
    L(`✓ Done: ${total} total rows`);
    return jsonRes({
      success: true,
      total_contacts: allContacts.length,
      total_calls: uniqueCalls.length,
      total_forms: uniqueForms.length,
      activity_rows: actRows.length,
      leads_daily_rows: leadsRows.length,
      log
    });
  } catch (err) {
    L(`✗ FATAL: ${err.message}`);
    return jsonRes({
      error: err.message,
      log
    }, 500);
  }
});
