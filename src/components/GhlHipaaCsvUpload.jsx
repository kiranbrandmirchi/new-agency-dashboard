import React, { useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';
import {
  mapCsvRowToHipaaCall,
  mapCsvRowToHipaaForm,
  validateCallCsvHeaders,
  validateFormCsvHeaders,
} from '../utils/ghlHipaaCsv';

const PREVIEW_ROWS = 8;
const UPSERT_CHUNK = 400;

function summarizeCalls(rows) {
  let answered = 0;
  let missed = 0;
  let voicemail = 0;
  rows.forEach((r) => {
    const s = String(r.call_status || '').toLowerCase();
    if (s.includes('answer')) answered += 1;
    else if (s.includes('miss')) missed += 1;
    else if (s.includes('voice')) voicemail += 1;
  });
  return { answered, missed, voicemail, total: rows.length };
}

async function upsertChunks(table, rows) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}

function PreviewTable({ rows, columns }) {
  const slice = rows.slice(0, PREVIEW_ROWS);
  if (!slice.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No rows to preview.</p>;
  return (
    <div className="table-wrapper" style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
      <table className="data-table gads-table" style={{ fontSize: 11 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row[c] != null && row[c] !== '' ? String(row[c]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GhlHipaaCsvUpload({ locationId, accountLabel, onUploaded, showNotification }) {
  const callsInputRef = useRef(null);
  const formsInputRef = useRef(null);
  const [callRawRows, setCallRawRows] = useState([]);
  const [formRawRows, setFormRawRows] = useState([]);
  const [callMapped, setCallMapped] = useState([]);
  const [formMapped, setFormMapped] = useState([]);
  const [clearCalls, setClearCalls] = useState(false);
  const [clearForms, setClearForms] = useState(false);
  const [uploadingCalls, setUploadingCalls] = useState(false);
  const [uploadingForms, setUploadingForms] = useState(false);
  const [callMessage, setCallMessage] = useState(null);
  const [formMessage, setFormMessage] = useState(null);
  const [callError, setCallError] = useState(null);
  const [formError, setFormError] = useState(null);

  const parseCallsFile = useCallback((file) => {
    setCallError(null);
    setCallMessage(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data || [];
        setCallRawRows(rows);
        const v = validateCallCsvHeaders(rows[0]);
        if (!v.ok) {
          setCallMapped([]);
          setCallError(`Missing columns: ${v.missing.join(', ')}`);
          return;
        }
        const mapped = rows
          .map((r) => mapCsvRowToHipaaCall(r, locationId))
          .filter((r) => r.date_time);
        setCallMapped(mapped);
        if (mapped.length < rows.length) {
          setCallError(`${rows.length - mapped.length} row(s) skipped (invalid date/time).`);
        }
      },
      error: (err) => {
        setCallRawRows([]);
        setCallMapped([]);
        setCallError(err?.message || 'Failed to parse CSV');
      },
    });
  }, [locationId]);

  const parseFormsFile = useCallback((file) => {
    setFormError(null);
    setFormMessage(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data || [];
        setFormRawRows(rows);
        const v = validateFormCsvHeaders(rows[0]);
        if (!v.ok) {
          setFormMapped([]);
          setFormError(`Missing columns: ${v.missing.join(', ')}`);
          return;
        }
        const mapped = rows
          .map((r) => mapCsvRowToHipaaForm(r, locationId))
          .filter((r) => r.submission_date);
        setFormMapped(mapped);
        if (mapped.length < rows.length) {
          setFormError(`${rows.length - mapped.length} row(s) skipped (invalid submission date).`);
        }
      },
      error: (err) => {
        setFormRawRows([]);
        setFormMapped([]);
        setFormError(err?.message || 'Failed to parse CSV');
      },
    });
  }, [locationId]);

  const uploadCalls = async () => {
    if (!callMapped.length) {
      showNotification?.('No valid call rows to upload.');
      return;
    }
    setUploadingCalls(true);
    setCallError(null);
    setCallMessage(null);
    try {
      if (clearCalls) {
        const { error: delErr } = await supabase.from('ghl_hipaa_calls').delete().eq('location_id', locationId);
        if (delErr) throw delErr;
      }
      await upsertChunks('ghl_hipaa_calls', callMapped);
      const { answered, missed, voicemail, total } = summarizeCalls(callMapped);
      const msg = `${total} calls uploaded (${answered} answered, ${missed} missed, ${voicemail} voicemail)`;
      setCallMessage(msg);
      showNotification?.(msg);
      onUploaded?.();
    } catch (e) {
      const m = e?.message || 'Upload failed';
      setCallError(m);
      showNotification?.(m);
    } finally {
      setUploadingCalls(false);
    }
  };

  const uploadForms = async () => {
    if (!formMapped.length) {
      showNotification?.('No valid form rows to upload.');
      return;
    }
    setUploadingForms(true);
    setFormError(null);
    setFormMessage(null);
    try {
      if (clearForms) {
        const { error: delErr } = await supabase.from('ghl_hipaa_forms').delete().eq('location_id', locationId);
        if (delErr) throw delErr;
      }
      await upsertChunks('ghl_hipaa_forms', formMapped);
      const msg = `${formMapped.length} form submissions uploaded`;
      setFormMessage(msg);
      showNotification?.(msg);
      onUploaded?.();
    } catch (e) {
      const m = e?.message || 'Upload failed';
      setFormError(m);
      showNotification?.(m);
    } finally {
      setUploadingForms(false);
    }
  };

  const callPreviewCols = ['Date & Time', 'Contact Name', 'Contact Phone', 'Call Status', 'Duration', 'Source Type'];

  return (
    <div
      style={{
        padding: '16px 0 0',
        borderTop: '1px dashed var(--border)',
        marginTop: 12,
        display: 'grid',
        gap: 20,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        HIPAA location <strong>{accountLabel || locationId}</strong> — API sync is disabled. Upload GHL exports below (client-side parse; data is upserted to Supabase).
      </p>

      <div className="panel" style={{ margin: 0 }}>
        <div className="panel-body">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Call report CSV</div>
          <input ref={callsInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) parseCallsFile(f);
          }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => callsInputRef.current?.click()}>
              Choose CSV
            </button>
            {callRawRows.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{callRawRows.length} rows parsed → {callMapped.length} valid</span>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={clearCalls} onChange={(e) => setClearCalls(e.target.checked)} />
            Clear existing calls for this location before upload
          </label>
          <PreviewTable rows={callRawRows} columns={callPreviewCols} />
          {callError && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{callError}</p>}
          {callMessage && <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>{callMessage}</p>}
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={uploadCalls} disabled={uploadingCalls || !callMapped.length}>
            {uploadingCalls ? 'Uploading…' : 'Upload calls'}
          </button>
        </div>
      </div>

      <div className="panel" style={{ margin: 0 }}>
        <div className="panel-body">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Form submissions CSV</div>
          <input ref={formsInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) parseFormsFile(f);
          }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => formsInputRef.current?.click()}>
              Choose CSV
            </button>
            {formRawRows.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formRawRows.length} rows parsed → {formMapped.length} valid</span>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={clearForms} onChange={(e) => setClearForms(e.target.checked)} />
            Clear existing forms for this location before upload
          </label>
          <PreviewTable rows={formRawRows} columns={['Name', 'Phone', 'Email', 'Submission Date', 'URL']} />
          {formError && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{formError}</p>}
          {formMessage && <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>{formMessage}</p>}
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={uploadForms} disabled={uploadingForms || !formMapped.length}>
            {uploadingForms ? 'Uploading…' : 'Upload forms'}
          </button>
        </div>
      </div>
    </div>
  );
}
