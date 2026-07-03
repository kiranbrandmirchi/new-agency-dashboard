/**
 * Export monthly report as editable .pptx (monthlyPptxBuilder only).
 * Keyword rankings uses readable section snapshots (Top 20, All Locations) when signed in.
 */
export async function generateMonthlyPptx(exportData, options = {}) {
  const { returnBlob = false, googleAccessToken = '' } = options;
  const { isDirectImageUrl, resolveKeywordSheetUrl } = await import('./googleSheetsEmbed');
  const { buildKeywordSheetSnapshotImage } = await import('./keywordSheetCapture');

  let payload = exportData;
  const seo = exportData?.seo || {};

  const auctionSheetUrl = exportData?.auctionSheetUrl || '';
  const auctionSheetPreviousUrl = exportData?.auctionSheetPreviousUrl || '';
  if (auctionSheetUrl || auctionSheetPreviousUrl) {
    const { fetchAuctionInsightsComparison } = await import('./auctionInsightsSheet');
    const clientName = exportData?.client || options.clientName || '';
    const result = await fetchAuctionInsightsComparison(
      auctionSheetUrl,
      auctionSheetPreviousUrl,
      clientName,
      {
        accessToken: googleAccessToken || undefined,
        customerIds: exportData?.googleAdsCustomerIds?.length
          ? exportData.googleAdsCustomerIds
          : (exportData?.googleAdsCustomerId ? [exportData.googleAdsCustomerId] : []),
      },
    );
    if (result.current.rows.length || result.previous.rows.length) {
      payload = {
        ...payload,
        auctionInsights: {
          ...(payload.auctionInsights || {}),
          current: {
            periodLabel: result.current.periodLabel || exportData?.currentShortLabel || exportData?.month || '',
            table: result.current.rows,
          },
          previous: {
            periodLabel: result.previous.periodLabel || exportData?.previousShortLabel || 'Previous month',
            table: result.previous.rows,
          },
          table: result.current.rows,
        },
      };
    } else if (import.meta.env?.DEV) {
      console.warn('[PPT] Auction sheet load failed:', result.error);
    }
  }

  const sheetUrl = resolveKeywordSheetUrl(seo.keywordTracker, seo.keywordScreenshot);
  const directImage = isDirectImageUrl(seo.keywordScreenshot?.imageUrl)
    ? seo.keywordScreenshot.imageUrl
    : '';

  let keywordSheetImageDataUrl = directImage || seo.keywordSheetImageDataUrl || '';
  let keywordSheetSnapshots = seo.keywordSheetSnapshots || [];

  if (!keywordSheetImageDataUrl && sheetUrl) {
    const clientTitle = `Keywords Ranking — ${exportData?.client || options.clientName || ''}`;
    const snapshot = await buildKeywordSheetSnapshotImage(
      sheetUrl,
      googleAccessToken || undefined,
      clientTitle,
    );
    if (snapshot.snapshots?.length) {
      keywordSheetSnapshots = snapshot.snapshots;
      keywordSheetImageDataUrl = snapshot.snapshots[0].imageDataUrl;
    } else if (snapshot.imageDataUrl) {
      keywordSheetImageDataUrl = snapshot.imageDataUrl;
      keywordSheetSnapshots = [{
        key: 'summary',
        label: 'Keyword Rankings',
        title: clientTitle,
        imageDataUrl: snapshot.imageDataUrl,
      }];
    }
    if (keywordSheetImageDataUrl) {
      payload = {
        ...exportData,
        seo: {
          ...seo,
          keywordSheetTable: snapshot.table || seo.keywordSheetTable,
          keywordSheetFormatted: snapshot.formatted || null,
          keywordSheetImageDataUrl,
          keywordSheetSnapshots,
        },
      };
    } else if (import.meta.env?.DEV) {
      console.warn('[PPT] Keyword sheet snapshot failed — sign in with the Google account that owns the sheet', sheetUrl);
    }
  } else if (keywordSheetImageDataUrl) {
    payload = {
      ...exportData,
      seo: {
        ...seo,
        keywordSheetImageDataUrl,
        keywordSheetSnapshots: keywordSheetSnapshots.length
          ? keywordSheetSnapshots
          : [{
            key: 'summary',
            label: 'Keyword Rankings',
            title: `Keywords Ranking — ${exportData?.client || options.clientName || ''}`,
            imageDataUrl: keywordSheetImageDataUrl,
          }],
      },
    };
  }

  const { buildEditableMonthlyPptx } = await import('./monthlyPptxBuilder');
  return buildEditableMonthlyPptx(payload, options, returnBlob ? 'blob' : 'download');
}

/** Build .pptx as Blob (for Google Drive upload). */
export async function generateMonthlyPptxBlob(exportData, options = {}) {
  return generateMonthlyPptx(exportData, { ...options, returnBlob: true });
}
