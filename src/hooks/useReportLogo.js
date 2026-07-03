import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';

export const DEFAULT_REPORT_LOGO = '/rc-brand-logo.png';

export function useReportLogo(effectiveAgencyId, options = {}) {
  const { onSaved, onReset } = options;
  const { patchAgencyFields } = useAuth();
  const { showNotification } = useApp();

  const [reportLogoUrl, setReportLogoUrl] = useState('');
  const [savedReportLogoUrl, setSavedReportLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [resettingLogo, setResettingLogo] = useState(false);

  const coverLogoUrl = reportLogoUrl || DEFAULT_REPORT_LOGO;
  const logoDirty = reportLogoUrl.trim() !== (savedReportLogoUrl || '');
  const logoBusy = uploadingLogo || savingLogo || resettingLogo;

  useEffect(() => {
    if (!effectiveAgencyId) {
      setReportLogoUrl('');
      setSavedReportLogoUrl('');
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('agencies')
      .select('report_logo_url')
      .eq('id', effectiveAgencyId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[ReportLogo] report_logo_url load:', error);
          setReportLogoUrl('');
          setSavedReportLogoUrl('');
          return;
        }
        const url = data?.report_logo_url || '';
        setReportLogoUrl(url);
        setSavedReportLogoUrl(url);
      });
    return () => { cancelled = true; };
  }, [effectiveAgencyId]);

  const handleReportLogoUpload = useCallback(async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !effectiveAgencyId) return;
    setUploadingLogo(true);
    try {
      const path = `${effectiveAgencyId}/report/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('agency-logos').getPublicUrl(path);
      setReportLogoUrl(publicUrl);
      showNotification('Logo uploaded — click Save Logo to apply to reports');
    } catch (err) {
      showNotification(err?.message || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }, [effectiveAgencyId, showNotification]);

  const handleSaveReportLogo = useCallback(async () => {
    if (!effectiveAgencyId) return;
    setSavingLogo(true);
    try {
      const url = reportLogoUrl.trim() || null;
      const { error } = await supabase
        .from('agencies')
        .update({ report_logo_url: url })
        .eq('id', effectiveAgencyId);
      if (error) throw error;
      const saved = url || '';
      setSavedReportLogoUrl(saved);
      setReportLogoUrl(saved);
      patchAgencyFields(effectiveAgencyId, { report_logo_url: url });
      onSaved?.(url);
      showNotification('Report logo saved');
    } catch (err) {
      showNotification(err?.message || 'Failed to save report logo');
    } finally {
      setSavingLogo(false);
    }
  }, [effectiveAgencyId, reportLogoUrl, patchAgencyFields, onSaved, showNotification]);

  const handleResetReportLogo = useCallback(async () => {
    if (!effectiveAgencyId) return;
    setResettingLogo(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .update({ report_logo_url: null })
        .eq('id', effectiveAgencyId);
      if (error) throw error;
      setReportLogoUrl('');
      setSavedReportLogoUrl('');
      patchAgencyFields(effectiveAgencyId, { report_logo_url: null });
      onReset?.();
      showNotification('Report logo reset to default');
    } catch (err) {
      showNotification(err?.message || 'Failed to reset report logo');
    } finally {
      setResettingLogo(false);
    }
  }, [effectiveAgencyId, patchAgencyFields, onReset, showNotification]);

  return useMemo(() => ({
    coverLogoUrl,
    reportLogoUrl,
    savedReportLogoUrl,
    setReportLogoUrl,
    logoDirty,
    logoBusy,
    uploadingLogo,
    savingLogo,
    resettingLogo,
    handleReportLogoUpload,
    handleSaveReportLogo,
    handleResetReportLogo,
  }), [
    coverLogoUrl,
    reportLogoUrl,
    savedReportLogoUrl,
    logoDirty,
    logoBusy,
    uploadingLogo,
    savingLogo,
    resettingLogo,
    handleReportLogoUpload,
    handleSaveReportLogo,
    handleResetReportLogo,
  ]);
}
