/**
 * Bing / Microsoft Advertising Reporting API v13 → bing_*_daily tables.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      BING_CLIENT_ID, BING_CLIENT_SECRET, BING_DEVELOPER_TOKEN, BING_TENANT (default: common)
 *
 * Flow: refresh access token → SubmitGenerateReport (SOAP) → PollGenerateReport
 * (SOAP) → download CSV → upsert. One sync call submits the six standard reports
 * for a single advertiser account.
 */ import { unzipSync } from "npm:fflate@0.8.2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const REPORTING_URL = "https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc";
const SOAP_NS = "https://bingads.microsoft.com/Reporting/v13";
function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function num(v) {
  const n = Number(String(v ?? "").replace(/[%,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function todayMinus(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}
function xmlEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
/** Naive single-tag extractor (good enough for the small set of values we read from SOAP responses). */ function getTag(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}
function getFaultMessage(xml) {
  const fault = getTag(xml, "faultstring") || getTag(xml, "Message");
  return fault ? fault.trim() : null;
}
function getDownloadUrl(xml) {
  const re = /<(?:[A-Za-z0-9_]+:)?ReportDownloadUrl\b([^/>]*)\/?>(?:([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?ReportDownloadUrl>)?/i;
  const m = xml.match(re);
  if (!m) return null;
  if (/\bi:nil\s*=\s*["']true["']/i.test(m[1] || "")) return null;
  const url = (m[2] || "").trim();
  if (!url) return null;
  return url.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
function reportDateFromRow(r) {
  const raw = r.GregorianDate || r.TimePeriod || "";
  if (!raw) return null;
  // TimePeriod daily values look like 6/1/2026 or 2026-06-01 depending on locale.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = us[1].padStart(2, "0");
    const dd = us[2].padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  return raw.slice(0, 10);
}
function extractReportText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    const entries = unzipSync(u8);
    const name = Object.keys(entries).find((k)=>/\.csv$/i.test(k));
    if (!name) throw new Error("ZIP report contained no CSV file");
    return new TextDecoder("utf-8").decode(entries[name]);
  }
  return new TextDecoder("utf-8").decode(u8);
}
function parseCsv(text) {
  // Microsoft reports include report metadata lines before the actual data table; the
  // real header row starts at "GregorianDate" (or whichever time column we requested).
  // We detect the first row that contains "GregorianDate" — that's the header.
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for(let i = 0; i < lines.length; i++){
    if (/^"?(GregorianDate|TimePeriod)"?,/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return {
    headers: [],
    rows: []
  };
  const splitCsvLine = (line)=>{
    const out = [];
    let cur = "";
    let inQ = false;
    for(let i = 0; i < line.length; i++){
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  };
  const headers = splitCsvLine(lines[headerIdx]).map((h)=>h.replace(/^"|"$/g, "").trim());
  const rows = [];
  for(let i = headerIdx + 1; i < lines.length; i++){
    const line = lines[i];
    if (!line || /^"?©|^Total/i.test(line)) continue;
    const cells = splitCsvLine(line);
    if (cells.length < headers.length / 2) continue;
    const row = {};
    headers.forEach((h, idx)=>{
      row[h] = (cells[idx] || "").replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return {
    headers,
    rows
  };
}
const REPORTS = [
  {
    key: "campaign",
    reportName: "CampaignPerformanceReportRequest",
    columnTag: "CampaignPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "CurrencyCode",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions",
      "Revenue"
    ],
    table: "bing_campaign_daily",
    conflict: "customer_id,campaign_id,ad_group_id,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.CampaignId) return null;
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId),
        campaign_name: r.CampaignName || null,
        ad_group_id: "",
        ad_group_name: null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        conversions_value: num(r.Revenue),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        country: "ALL",
        updated_at: new Date().toISOString()
      };
    }
  },
  {
    key: "adgroup",
    reportName: "AdGroupPerformanceReportRequest",
    columnTag: "AdGroupPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "AdGroupId",
      "AdGroupName",
      "CurrencyCode",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions",
      "Revenue"
    ],
    table: "bing_campaign_daily",
    conflict: "customer_id,campaign_id,ad_group_id,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.AdGroupId) return null;
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId || ""),
        campaign_name: r.CampaignName || null,
        ad_group_id: String(r.AdGroupId),
        ad_group_name: r.AdGroupName || null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        conversions_value: num(r.Revenue),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        country: "ALL",
        updated_at: new Date().toISOString()
      };
    }
  },
  {
    key: "keyword",
    reportName: "KeywordPerformanceReportRequest",
    columnTag: "KeywordPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "AdGroupId",
      "AdGroupName",
      "Keyword",
      "KeywordId",
      "BidMatchType",
      "CurrencyCode",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions",
      "Revenue",
      "AveragePosition"
    ],
    table: "bing_keyword_daily",
    conflict: "customer_id,campaign_id,ad_group_id,keyword_id,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.KeywordId) return null;
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId || ""),
        campaign_name: r.CampaignName || null,
        ad_group_id: String(r.AdGroupId || ""),
        ad_group_name: r.AdGroupName || null,
        keyword_id: String(r.KeywordId),
        keyword_text: r.Keyword || null,
        match_type: r.BidMatchType || null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        conversions_value: num(r.Revenue),
        avg_position: num(r.AveragePosition),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        updated_at: new Date().toISOString()
      };
    }
  },
  {
    key: "search_term",
    reportName: "SearchQueryPerformanceReportRequest",
    columnTag: "SearchQueryPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "AdGroupId",
      "AdGroupName",
      "SearchQuery",
      "Keyword",
      "BidMatchType",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions"
    ],
    table: "bing_search_term_daily",
    conflict: "customer_id,campaign_id,ad_group_id,search_term,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.SearchQuery) return null;
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId || ""),
        campaign_name: r.CampaignName || null,
        ad_group_id: String(r.AdGroupId || ""),
        ad_group_name: r.AdGroupName || null,
        search_term: String(r.SearchQuery),
        keyword_text: r.Keyword || null,
        match_type: r.BidMatchType || null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        updated_at: new Date().toISOString()
      };
    }
  },
  {
    key: "ad",
    reportName: "AdPerformanceReportRequest",
    columnTag: "AdPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "AdGroupId",
      "AdGroupName",
      "AdId",
      "AdTitle",
      "AdType",
      "CurrencyCode",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions",
      "Revenue"
    ],
    table: "bing_ad_daily",
    conflict: "customer_id,campaign_id,ad_group_id,ad_id,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.AdId) return null;
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId || ""),
        campaign_name: r.CampaignName || null,
        ad_group_id: String(r.AdGroupId || ""),
        ad_group_name: r.AdGroupName || null,
        ad_id: String(r.AdId),
        ad_title: r.AdTitle || null,
        ad_type: r.AdType || null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        conversions_value: num(r.Revenue),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        updated_at: new Date().toISOString()
      };
    }
  },
  {
    key: "geo",
    reportName: "GeographicPerformanceReportRequest",
    columnTag: "GeographicPerformanceReportColumn",
    scopeXml: (id)=>`<Scope i:nil="false"><AccountIds i:nil="false" xmlns:a1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><a1:long>${xmlEscape(id)}</a1:long></AccountIds></Scope>`,
    columns: [
      "TimePeriod",
      "AccountId",
      "CampaignId",
      "CampaignName",
      "LocationId",
      "Country",
      "State",
      "City",
      "CurrencyCode",
      "Impressions",
      "Clicks",
      "Spend",
      "Conversions"
    ],
    table: "bing_geo_location_daily",
    conflict: "customer_id,campaign_id,location_id,report_date",
    toRow: (r, customerId)=>{
      const reportDate = reportDateFromRow(r);
      if (!reportDate || !r.CampaignId) return null;
      const locationId = String(r.LocationId || "");
      const locationName = [
        r.City,
        r.State,
        r.Country
      ].filter(Boolean).join(", ") || r.Country || "";
      return {
        customer_id: customerId,
        campaign_id: String(r.CampaignId),
        campaign_name: r.CampaignName || null,
        location_id: locationId,
        location_name: locationName || null,
        country_code: r.Country || null,
        report_date: reportDate,
        impressions: Math.round(num(r.Impressions)),
        clicks: Math.round(num(r.Clicks)),
        spend: num(r.Spend),
        conversions: Math.round(num(r.Conversions)),
        currency: (r.CurrencyCode || "USD").slice(0, 8),
        updated_at: new Date().toISOString()
      };
    }
  }
];
function buildSubmitEnvelope(opts) {
  const colXml = opts.columns.map((c)=>`<${opts.columnTag}>${xmlEscape(c)}</${opts.columnTag}>`).join("");
  const [fromY, fromM, fromD] = opts.dateFrom.split("-").map((x)=>parseInt(x, 10));
  const [toY, toM, toD] = opts.dateTo.split("-").map((x)=>parseInt(x, 10));
  const customerIdHeader = opts.managerCustomerId
    ? `<CustomerId i:nil="false">${xmlEscape(opts.managerCustomerId)}</CustomerId>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header xmlns="${SOAP_NS}">
    <Action mustUnderstand="1">SubmitGenerateReport</Action>
    <AuthenticationToken i:nil="false">${xmlEscape(opts.accessToken)}</AuthenticationToken>
    <CustomerAccountId i:nil="false">${xmlEscape(opts.customerAccountId)}</CustomerAccountId>
    ${customerIdHeader}
    <DeveloperToken i:nil="false">${xmlEscape(opts.developerToken)}</DeveloperToken>
  </s:Header>
  <s:Body>
    <SubmitGenerateReportRequest xmlns="${SOAP_NS}">
      <ReportRequest i:nil="false" i:type="${opts.reportName}">
        <ExcludeColumnHeaders>false</ExcludeColumnHeaders>
        <ExcludeReportFooter>true</ExcludeReportFooter>
        <ExcludeReportHeader>true</ExcludeReportHeader>
        <Format>Csv</Format>
        <ReportName>${xmlEscape(opts.reportName)}</ReportName>
        <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
        <Aggregation>Daily</Aggregation>
        <Columns i:nil="false">${colXml}</Columns>
        ${opts.scopeXml}
        <Time i:nil="false">
          <CustomDateRangeEnd i:nil="false">
            <Day>${toD}</Day>
            <Month>${toM}</Month>
            <Year>${toY}</Year>
          </CustomDateRangeEnd>
          <CustomDateRangeStart i:nil="false">
            <Day>${fromD}</Day>
            <Month>${fromM}</Month>
            <Year>${fromY}</Year>
          </CustomDateRangeStart>
          <ReportTimeZone>GreenwichMeanTimeDublinEdinburghLisbonLondon</ReportTimeZone>
        </Time>
      </ReportRequest>
    </SubmitGenerateReportRequest>
  </s:Body>
</s:Envelope>`;
}
function buildPollEnvelope(opts) {
  const customerIdHeader = opts.managerCustomerId
    ? `<CustomerId i:nil="false">${xmlEscape(opts.managerCustomerId)}</CustomerId>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Header xmlns="${SOAP_NS}">
    <Action mustUnderstand="1">PollGenerateReport</Action>
    <AuthenticationToken i:nil="false">${xmlEscape(opts.accessToken)}</AuthenticationToken>
    <CustomerAccountId i:nil="false">${xmlEscape(opts.customerAccountId)}</CustomerAccountId>
    ${customerIdHeader}
    <DeveloperToken i:nil="false">${xmlEscape(opts.developerToken)}</DeveloperToken>
  </s:Header>
  <s:Body>
    <PollGenerateReportRequest xmlns="${SOAP_NS}">
      <ReportRequestId>${xmlEscape(opts.reportRequestId)}</ReportRequestId>
    </PollGenerateReportRequest>
  </s:Body>
</s:Envelope>`;
}
async function soapCall(action, envelope) {
  const res = await fetch(REPORTING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${action}"`
    },
    body: envelope
  });
  const xml = await res.text();
  return {
    ok: res.ok,
    xml,
    status: res.status
  };
}
async function searchBingAccounts(accessToken, developerToken, predicates) {
  const res = await fetch("https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      AuthenticationToken: accessToken,
      DeveloperToken: developerToken
    },
    body: JSON.stringify({
      Predicates: predicates,
      Ordering: [
        {
          Field: "Id",
          Order: "Ascending"
        }
      ],
      PageInfo: {
        Index: 0,
        Size: 100
      }
    })
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) {
    throw new Error(`Accounts/Search failed (${res.status}): ${JSON.stringify(json).slice(0, 240)}`);
  }
  return json.Accounts || json.accounts || [];
}
/** Manager IDs from the Microsoft UI are CustomerIds; reporting needs child Advertiser AccountIds. */ async function resolveBingAccountIds(accessToken, developerToken, requestedId, log) {
  const children = await searchBingAccounts(accessToken, developerToken, [
    {
      Field: "CustomerId",
      Operator: "Equals",
      Value: requestedId
    }
  ]);
  if (children.length) {
    const summary = children.map((a)=>`${a.Id ?? a.id}:${a.Name ?? a.name ?? ""}:${a.AccountType ?? a.accountType ?? ""}`).join("; ");
    log(`Found ${children.length} account(s) for manager ${requestedId}: ${summary}`);
    const advertiser = children.find((a)=>{
      const t = String(a.AccountType ?? a.accountType ?? "").toLowerCase();
      return !t || t === "advertiser";
    }) || children[0];
    const advertiserAccountId = String(advertiser.Id ?? advertiser.id ?? "");
    log(`Resolved manager ${requestedId} → advertiser account ${advertiserAccountId} (${advertiser.Name ?? advertiser.name ?? ""})`);
    return {
      managerCustomerId: requestedId,
      advertiserAccountId
    };
  }
  const all = await searchBingAccounts(accessToken, developerToken, []);
  const direct = all.find((a)=>String(a.Id ?? a.id ?? "") === requestedId);
  if (direct) {
    const managerCustomerId = String(direct.ParentCustomerId ?? direct.parentCustomerId ?? requestedId);
    log(`Using advertiser account ${requestedId} (manager ${managerCustomerId})`);
    return {
      managerCustomerId,
      advertiserAccountId: requestedId
    };
  }
  log(`Could not resolve advertiser account for ${requestedId}; using as-is`);
  return {
    managerCustomerId: requestedId,
    advertiserAccountId: requestedId
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders
  });
  const L = [];
  const log = (msg)=>{
    L.push(msg);
    console.log(msg);
  };
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL") || "";
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const clientId = Deno.env.get("BING_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("BING_CLIENT_SECRET") || "";
    const developerToken = Deno.env.get("BING_DEVELOPER_TOKEN") || "";
    const tenant = Deno.env.get("BING_TENANT") || "common";
    if (!clientId || !clientSecret || !developerToken) {
      return jsonRes({
        error: "BING_CLIENT_ID / BING_CLIENT_SECRET / BING_DEVELOPER_TOKEN not configured",
        log: L
      }, 500);
    }
    let body = {};
    try {
      body = await req.json();
    } catch  {
      body = {};
    }
    const customerId = body.customer_id || null;
    const mode = body.mode || "daily";
    const debug = Boolean(body.debug);
    const daysBack = num(body.days_back) || 5;
    let dateFrom = body.date_from || "";
    let dateTo = body.date_to || "";
    if (!customerId) return jsonRes({
      error: "customer_id required",
      log: L
    }, 400);
    if (!(mode === "backfill" && dateFrom && dateTo)) {
      dateFrom = todayMinus(daysBack);
      dateTo = todayMinus(1);
    }
    log(`=== BING FULL SYNC === ${customerId} | ${dateFrom} → ${dateTo}`);
    // ---- Lookup agency_id from client_platform_accounts ----
    const cpaRes = await fetch(`${SB_URL}/rest/v1/client_platform_accounts?platform_customer_id=eq.${encodeURIComponent(customerId)}&platform=eq.bing&is_active=eq.true&select=agency_id`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    });
    const cpaRows = await cpaRes.json();
    if (!Array.isArray(cpaRows) || !cpaRows.length) {
      return jsonRes({
        error: "No active Bing account found for customer_id",
        log: L
      }, 400);
    }
    const agencyId = cpaRows[0].agency_id;
    // ---- Lookup credential ----
    const credRes = await fetch(`${SB_URL}/rest/v1/agency_platform_credentials?agency_id=eq.${agencyId}&platform=eq.bing&is_active=eq.true&select=oauth_refresh_token,oauth_access_token,oauth_token_expires_at,id`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    });
    const credRows = await credRes.json();
    const credRow = Array.isArray(credRows) ? credRows[0] : null;
    if (!credRow?.id) {
      return jsonRes({
        error: "No Bing credential (connect Bing in Settings)",
        log: L
      }, 400);
    }
    const credRowId = credRow.id;
    const refreshToken = credRow.oauth_refresh_token || "";
    const storedAccess = credRow.oauth_access_token || "";
    const expAt = credRow.oauth_token_expires_at;
    let accessToken = storedAccess;
    const expiringSoon = !expAt || new Date(expAt).getTime() <= Date.now() + 60_000;
    if (!storedAccess || expiringSoon) {
      if (!refreshToken) {
        return jsonRes({
          error: "Bing access token expired and no refresh token; reconnect in Settings.",
          log: L
        }, 400);
      }
      const refreshForm = new URLSearchParams();
      refreshForm.set("client_id", clientId);
      refreshForm.set("client_secret", clientSecret);
      refreshForm.set("grant_type", "refresh_token");
      refreshForm.set("refresh_token", refreshToken);
      refreshForm.set("scope", "https://ads.microsoft.com/msads.manage offline_access");
      const refreshRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: refreshForm.toString()
      });
      const refreshJson = await refreshRes.json().catch(()=>({}));
      if (!refreshRes.ok || !refreshJson.access_token) {
        return jsonRes({
          error: "Bing token refresh failed: " + (refreshJson.error_description || refreshJson.error || refreshRes.status),
          log: L
        }, 400);
      }
      accessToken = String(refreshJson.access_token);
      const newExp = new Date(Date.now() + (Number(refreshJson.expires_in) || 3600) * 1000).toISOString();
      const newRefresh = String(refreshJson.refresh_token || refreshToken);
      await fetch(`${SB_URL}/rest/v1/agency_platform_credentials?id=eq.${credRowId}`, {
        method: "PATCH",
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          oauth_access_token: accessToken,
          oauth_refresh_token: newRefresh,
          oauth_token_expires_at: newExp
        })
      });
      log("Refreshed Bing access token.");
    }
    const { managerCustomerId, advertiserAccountId } = await resolveBingAccountIds(accessToken, developerToken, customerId, log);
    // ---- DB upsert helper ----
    async function su(table, rows, conflict) {
      if (!rows.length) return 0;
      const seen = new Set();
      const deduped = rows.filter((row)=>{
        const key = conflict.split(",").map((k)=>String(row[k.trim()] ?? "")).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      let total = 0;
      for(let i = 0; i < deduped.length; i += 400){
        const chunk = deduped.slice(i, i + 400);
        const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
          method: "POST",
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) {
          log(`WARN upsert ${table}: ${(await res.text()).slice(0, 240)}`);
        } else {
          total += chunk.length;
        }
      }
      return total;
    }
    // ---- Submit, poll, download, parse, upsert each report ----
    let totalRows = 0;
    const breakdown = {};
    for (const spec of REPORTS){
      try {
        const submit = await soapCall("SubmitGenerateReport", buildSubmitEnvelope({
          accessToken,
          developerToken,
          managerCustomerId,
          customerAccountId: advertiserAccountId,
          reportName: spec.reportName,
          columnTag: spec.columnTag,
          scopeXml: spec.scopeXml(advertiserAccountId),
          columns: spec.columns,
          dateFrom,
          dateTo
        }));
        if (!submit.ok) {
          log(`Submit ${spec.key} failed: ${submit.status} — ${getFaultMessage(submit.xml) || submit.xml.slice(0, 240)}`);
          continue;
        }
        const reportRequestId = getTag(submit.xml, "ReportRequestId");
        if (!reportRequestId) {
          log(`Submit ${spec.key}: no ReportRequestId in response — ${getFaultMessage(submit.xml) || submit.xml.slice(0, 320)}`);
          continue;
        }
        let downloadUrl = null;
        let lastStatus = "";
        for(let attempt = 0; attempt < 30; attempt++){
          await new Promise((r)=>setTimeout(r, 4000));
          const poll = await soapCall("PollGenerateReport", buildPollEnvelope({
            accessToken,
            developerToken,
            managerCustomerId,
            customerAccountId: advertiserAccountId,
            reportRequestId
          }));
          if (!poll.ok) {
            log(`Poll ${spec.key} failed: ${poll.status} — ${getFaultMessage(poll.xml) || poll.xml.slice(0, 240)}`);
            break;
          }
          const status = getTag(poll.xml, "Status") || "";
          lastStatus = status;
          if (status === "Success") {
            downloadUrl = getDownloadUrl(poll.xml);
            if (debug) {
              log(`Poll ${spec.key} XML: ${poll.xml.slice(0, 1500)}`);
            }
            break;
          }
          if (status === "Error" || status === "Failure") {
            log(`Report ${spec.key} failed: ${status}`);
            break;
          }
        }
        if (!downloadUrl) {
          if (lastStatus === "Success") {
            log(`Report ${spec.key}: no data for ${dateFrom}–${dateTo}.`);
          } else {
            log(`Report ${spec.key} did not complete (last status: ${lastStatus}).`);
          }
          continue;
        }
        const dlRes = await fetch(downloadUrl);
        if (!dlRes.ok) {
          log(`Download ${spec.key} failed: ${dlRes.status}`);
          continue;
        }
        const text = extractReportText(await dlRes.arrayBuffer());
        const { rows } = parseCsv(text);
        const dbRows = [];
        for (const r of rows){
          const dbRow = spec.toRow(r, customerId);
          if (dbRow) dbRows.push(dbRow);
        }
        const upserted = await su(spec.table, dbRows, spec.conflict);
        breakdown[spec.key] = upserted;
        totalRows += upserted;
        log(`Report ${spec.key}: ${upserted} rows upserted into ${spec.table}.`);
      } catch (e) {
        log(`Report ${spec.key} threw: ${e?.message || e}`);
      }
    }
    // ---- Mark customer last_synced_at ----
    await fetch(`${SB_URL}/rest/v1/bing_customers?customer_id=eq.${encodeURIComponent(customerId)}`, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        last_synced_at: new Date().toISOString()
      })
    });
    return jsonRes({
      success: true,
      total_rows: totalRows,
      breakdown,
      log: L
    });
  } catch (err) {
    console.error("bing-full-sync:", err);
    return jsonRes({
      error: "Internal server error",
      detail: String(err?.message || err)
    }, 500);
  }
});
