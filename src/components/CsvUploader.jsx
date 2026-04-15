import React, { useRef } from 'react';
import Papa from 'papaparse';

function downloadTemplate() {
  const csv = `Metric,Value,Notes,Source\nImpression Share,45.2%,Top competitor data,Auction Insights\nPhone Calls,156,From CallRail,Call Tracking`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'upload_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function CsvUploader({ label, value, onChange, disabled }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data || [];
        onChange(rows);
      },
      error: (err) => {
        console.warn('[CsvUploader] parse error:', err);
        onChange([]);
      },
    });
    e.target.value = '';
  };

  return (
    <div className="gads-filter-group" style={{ marginBottom: 12 }}>
      {label && <label className="gads-filter-label">{label}</label>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {value?.length ? 'Re-upload CSV' : 'Upload CSV'}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={downloadTemplate}
          style={{ fontSize: 11 }}
        >
          Download Template
        </button>
        {value?.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {value.length} rows loaded
          </span>
        )}
      </div>
    </div>
  );
}
