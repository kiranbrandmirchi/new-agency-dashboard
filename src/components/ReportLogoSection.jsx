import React from 'react';

export function ReportLogoSection({
  coverLogoUrl,
  reportLogoUrl,
  savedReportLogoUrl,
  onReportLogoUrlChange,
  onUpload,
  onSave,
  onReset,
  logoDirty,
  logoBusy,
  uploadingLogo,
  savingLogo,
  resettingLogo,
  effectiveAgencyId,
  className = 'ppt-report-logo-section',
  showBorder = true,
}) {
  return (
    <div
      className={className}
      style={showBorder ? {
        marginBottom: 20,
        paddingBottom: 20,
        borderBottom: '1px solid var(--border)',
      } : undefined}
    >
      <div style={{ marginBottom: 12 }}>
        <strong>Report Logo</strong>
        <p className="panel-subtitle text-accent" style={{ marginTop: 4, marginBottom: 0 }}>
          Upload a logo for report cover slides. Separate from Settings sidebar branding.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 200,
            minHeight: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a',
            borderRadius: 6,
            border: '1px solid var(--border)',
            padding: 8,
          }}
        >
          <img
            src={coverLogoUrl}
            alt="Report logo preview"
            style={{ maxWidth: '100%', maxHeight: 56, objectFit: 'contain' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 480 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            Logo URL
          </label>
          <input
            type="text"
            value={reportLogoUrl}
            onChange={(e) => onReportLogoUrlChange(e.target.value)}
            placeholder="https://... or upload below"
            disabled={logoBusy || !effectiveAgencyId}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label
              className="btn btn-outline btn-sm"
              style={{ cursor: logoBusy || !effectiveAgencyId ? 'not-allowed' : 'pointer', margin: 0 }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={onUpload}
                disabled={logoBusy || !effectiveAgencyId}
                style={{ display: 'none' }}
              />
              {uploadingLogo ? 'Uploading…' : 'Upload logo'}
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSave}
              disabled={logoBusy || !effectiveAgencyId || !logoDirty}
            >
              {savingLogo ? 'Saving…' : 'Save Logo'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onReset}
              disabled={logoBusy || !effectiveAgencyId || (!savedReportLogoUrl && !reportLogoUrl)}
            >
              {resettingLogo ? 'Resetting…' : 'Reset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
