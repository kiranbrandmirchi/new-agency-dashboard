import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const PLATFORMS = ['google_ads', 'facebook_ads', 'bing_ads', 'tiktok_ads', 'pinterest_ads', 'reddit_ads', 'snapchat_ads', 'linkedin_ads'];
const CLIENT_PLATFORMS = ['google_ads', 'reddit', 'meta', 'bing', 'tiktok', 'ga4'];

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function statusBadge(status) {
  if (!status) return <span className="badge badge-gray">never</span>;
  const s = String(status).toLowerCase();
  if (s === 'success' || s === 'completed') return <span className="badge badge-green">success</span>;
  if (s === 'error' || s === 'failed') return <span className="badge badge-red">error</span>;
  return <span className="badge badge-gray">{status}</span>;
}
const CATEGORIES = ['sidebar', 'report_tab', 'action', 'customer'];

const DEFAULT_PERMISSIONS = [
  { permission_key: 'tab.combined_dashboard', permission_label: 'Dashboard Tab', category: 'sidebar' },
  { permission_key: 'sidebar.google_ads', permission_label: 'Google Ads', category: 'sidebar' },
  { permission_key: 'sidebar.facebook_ads', permission_label: 'Meta / Facebook Ads', category: 'sidebar' },
  { permission_key: 'sidebar.bing_ads', permission_label: 'Bing / Microsoft Ads', category: 'sidebar' },
  { permission_key: 'sidebar.tiktok_ads', permission_label: 'TikTok Ads', category: 'sidebar' },
  { permission_key: 'sidebar.reddit_ads', permission_label: 'Reddit Ads', category: 'sidebar' },
  { permission_key: 'sidebar.dsp', permission_label: 'DSP (TTD / DV360)', category: 'sidebar' },
  { permission_key: 'sidebar.dating_apps', permission_label: 'Dating Apps / Direct', category: 'sidebar' },
  { permission_key: 'sidebar.ctv', permission_label: 'CTV Campaigns', category: 'sidebar' },
  { permission_key: 'sidebar.analytics', permission_label: 'GA4 / Web Analytics', category: 'sidebar' },
  { permission_key: 'sidebar.email', permission_label: 'Email Marketing', category: 'sidebar' },
  { permission_key: 'sidebar.ghl', permission_label: 'GoHighLevel', category: 'sidebar' },
  { permission_key: 'sidebar.ott', permission_label: 'OTT / Vimeo', category: 'sidebar' },
  { permission_key: 'sidebar.seo', permission_label: 'SEO Performance', category: 'sidebar' },
  { permission_key: 'sidebar.geo', permission_label: 'Geographic View', category: 'sidebar' },
  { permission_key: 'sidebar.creatives', permission_label: 'Creative Analysis', category: 'sidebar' },
  { permission_key: 'sidebar.events', permission_label: 'Events / Special', category: 'sidebar' },
  { permission_key: 'sidebar.settings', permission_label: 'White-Label Settings', category: 'sidebar' },
  { permission_key: 'tab.daily_breakdown', permission_label: 'Daily Breakdown', category: 'report_tab' },
  { permission_key: 'tab.overview', permission_label: 'Campaign Types / Overview', category: 'report_tab' },
  { permission_key: 'tab.campaigns', permission_label: 'Campaigns', category: 'report_tab' },
  { permission_key: 'tab.ad_groups', permission_label: 'Ad Groups', category: 'report_tab' },
  { permission_key: 'tab.keywords', permission_label: 'Keywords', category: 'report_tab' },
  { permission_key: 'tab.search_terms', permission_label: 'Search Terms', category: 'report_tab' },
  { permission_key: 'tab.geo', permission_label: 'Geo', category: 'report_tab' },
  { permission_key: 'tab.conversions', permission_label: 'Conversions', category: 'report_tab' },
  { permission_key: 'action.export_pdf', permission_label: 'Export PDF', category: 'action' },
  { permission_key: 'action.share_report', permission_label: 'Share Report', category: 'action' },
  { permission_key: 'action.sync_data', permission_label: 'Sync Data', category: 'action' },
  { permission_key: 'action.manage_users', permission_label: 'Manage Users / Admin Panel', category: 'action' },
];

export function Admin() {
  const { user, agencyId, activeAgencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const showMessage = useCallback((msg, isError = false) => {
    setMessage(msg);
    setError(isError);
    setTimeout(() => { setMessage(null); setError(null); }, 4000);
  }, []);

  const tabs = [
    ...(isSuperAdmin ? [{ id: 'agencies', label: 'Agencies' }] : []),
    { id: 'users', label: 'Users' },
    { id: 'roles', label: 'Roles' },
    { id: 'clients', label: 'Clients' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'report_tabs', label: 'Report Tabs' },
  ];

  return (
    <div className="page-section active" id="page-admin">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Admin Panel</h2>
          <p>Manage users, roles, clients, and permissions</p>
        </div>

        <div className="admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {message && (
          <div className={`admin-message ${error ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {activeTab === 'agencies' && isSuperAdmin && <AdminAgenciesTab onMessage={showMessage} setLoading={setLoading} />}
        {activeTab === 'users' && <AdminUsersTab onMessage={showMessage} setLoading={setLoading} agencyId={activeAgencyId} isSuperAdmin={isSuperAdmin} currentUserId={user?.id} />}
        {activeTab === 'roles' && <AdminRolesTab onMessage={showMessage} setLoading={setLoading} />}
        {activeTab === 'clients' && <AdminClientsTab onMessage={showMessage} setLoading={setLoading} agencyId={activeAgencyId} isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'permissions' && <AdminPermissionsTab onMessage={showMessage} setLoading={setLoading} />}
        {activeTab === 'report_tabs' && <AdminReportTabsTab onMessage={showMessage} setLoading={setLoading} agencyId={activeAgencyId} />}
      </div>
    </div>
  );
}

function AdminAgenciesTab({ onMessage, setLoading }) {
  const { activeAgency, refreshAllAgencies } = useAuth();
  const [agencies, setAgencies] = useState([]);
  const [editingAgency, setEditingAgency] = useState(null);
  const [formData, setFormData] = useState({ agency_name: '', primary_color: '#E12627', secondary_color: '', accent_color: '#0083CB', sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '' });
  const [usersByAgency, setUsersByAgency] = useState({});
  const [credsByAgency, setCredsByAgency] = useState({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('agencies').select('*').order('agency_name');
      if (error) throw error;
      setAgencies(data || []);
    } catch (err) {
      onMessage(err?.message || 'Failed to load agencies', true);
    } finally {
      setLoading(false);
    }
  }, [onMessage, setLoading]);

  const loadAgencyDetails = useCallback(async (agencyId) => {
    if (!agencyId || typeof agencyId !== 'string') return;
    const [usersRes, credsRes] = await Promise.all([
      supabase.from('user_profiles').select('id, full_name, email').eq('agency_id', agencyId),
      supabase.from('agency_platform_credentials').select('id, platform, is_active').eq('agency_id', agencyId),
    ]);
    setUsersByAgency((p) => ({ ...p, [agencyId]: usersRes.data || [] }));
    setCredsByAgency((p) => ({ ...p, [agencyId]: credsRes.data || [] }));
  }, []);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  const slugify = (name) => {
    const base = (name || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return base || `agency-${Date.now()}`;
  };

  const saveAgency = async () => {
    if (!formData.agency_name?.trim()) return;
    try {
      if (editingAgency?.id) {
        const { error } = await supabase.from('agencies').update({
          agency_name: formData.agency_name.trim(),
          primary_color: formData.primary_color || null,
          secondary_color: formData.secondary_color || null,
          accent_color: formData.accent_color || null,
          sidebar_bg: formData.sidebar_bg || null,
          sidebar_text: formData.sidebar_text || null,
          font_family: formData.font_family || null,
          logo_url: formData.logo_url || null,
        }).eq('id', editingAgency.id);
        if (error) throw error;
        onMessage('Agency updated');
        refreshAllAgencies?.();
      } else {
        const baseSlug = slugify(formData.agency_name);
        const agencySlug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
        const { error } = await supabase.from('agencies').insert({
          agency_name: formData.agency_name.trim(),
          agency_slug: agencySlug,
          primary_color: formData.primary_color || null,
          secondary_color: formData.secondary_color || null,
          accent_color: formData.accent_color || null,
          sidebar_bg: formData.sidebar_bg || null,
          sidebar_text: formData.sidebar_text || null,
          font_family: formData.font_family || null,
          logo_url: formData.logo_url || null,
        });
        if (error) throw error;
        onMessage('Agency created');
      }
      setEditingAgency(null);
      setFormData({ agency_name: '', primary_color: '#E12627', secondary_color: '', accent_color: '#0083CB', sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '' });
      loadAgencies();
      refreshAllAgencies?.();
    } catch (err) {
      onMessage(err?.message || 'Failed to save', true);
    }
  };

  const openEdit = (a) => {
    setEditingAgency(a);
    setFormData({
      agency_name: a.agency_name || '',
      primary_color: a.primary_color || '#E12627',
      secondary_color: a.secondary_color || '',
      accent_color: a.accent_color || '#0083CB',
      sidebar_bg: a.sidebar_bg || '',
      sidebar_text: a.sidebar_text || '',
      font_family: a.font_family || '',
      logo_url: a.logo_url || '',
    });
    setPreviewActive(false);
    loadAgencyDetails(a.id);
  };

  const applyPreview = () => {
    const root = document.documentElement;
    if (formData.primary_color) { root.style.setProperty('--primary-color', formData.primary_color); root.style.setProperty('--primary', formData.primary_color); }
    if (formData.secondary_color) root.style.setProperty('--secondary-color', formData.secondary_color);
    if (formData.accent_color) { root.style.setProperty('--accent-color', formData.accent_color); root.style.setProperty('--accent', formData.accent_color); }
    if (formData.sidebar_bg) root.style.setProperty('--sidebar-bg', formData.sidebar_bg);
    if (formData.sidebar_text) root.style.setProperty('--sidebar-text', formData.sidebar_text);
    if (formData.font_family) root.style.setProperty('--font-family', formData.font_family);
    setPreviewActive(true);
  };

  const resetPreview = () => {
    const a = activeAgency;
    const root = document.documentElement;
    const defaults = { primary_color: '#E12627', accent_color: '#0083CB', secondary_color: '#666', sidebar_bg: '#1a1a2e', sidebar_text: '#fff', font_family: 'Inter, sans-serif' };
    const src = a || defaults;
    root.style.setProperty('--primary-color', src.primary_color || defaults.primary_color);
    root.style.setProperty('--primary', src.primary_color || defaults.primary_color);
    root.style.setProperty('--secondary-color', src.secondary_color || defaults.secondary_color);
    root.style.setProperty('--accent-color', src.accent_color || defaults.accent_color);
    root.style.setProperty('--accent', src.accent_color || defaults.accent_color);
    root.style.setProperty('--sidebar-bg', src.sidebar_bg || defaults.sidebar_bg);
    root.style.setProperty('--sidebar-text', src.sidebar_text || defaults.sidebar_text);
    root.style.setProperty('--font-family', src.font_family || defaults.font_family);
    setPreviewActive(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e?.target?.files?.[0];
    const agencyId = editingAgency?.id;
    if (!file || !agencyId) return;
    setUploadingLogo(true);
    try {
      const path = `${agencyId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('agency-logos').getPublicUrl(path);
      setFormData((f) => ({ ...f, logo_url: publicUrl }));
      onMessage('Logo uploaded');
    } catch (err) {
      onMessage(err?.message || 'Logo upload failed', true);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setEditingAgency({}); setFormData({ agency_name: '', primary_color: '#E12627', secondary_color: '', accent_color: '#0083CB', sidebar_bg: '', sidebar_text: '', font_family: '', logo_url: '' }); }}>Create Agency</button>
      </div>
      <div className="table-wrapper">
        <table className="data-table gads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Users</th>
              <th>Credentials</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}>
                <td>{a.agency_name || '—'}</td>
                <td>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => loadAgencyDetails(a.id)}>
                    View ({usersByAgency[a.id]?.length ?? '?'})
                  </button>
                  {usersByAgency[a.id]?.length > 0 && (
                    <ul style={{ marginTop: 4, paddingLeft: 16, fontSize: 12 }}>
                      {usersByAgency[a.id].slice(0, 3).map((u) => (
                        <li key={u.id}>{u.full_name || u.email}</li>
                      ))}
                      {usersByAgency[a.id].length > 3 && <li>+{usersByAgency[a.id].length - 3} more</li>}
                    </ul>
                  )}
                </td>
                <td>
                  {(credsByAgency[a.id] || []).map((c) => (
                    <span key={c.id} className="admin-platform-badge" style={{ marginRight: 4 }}>{c.platform}</span>
                  ))}
                  {(credsByAgency[a.id] || []).length === 0 && '—'}
                </td>
                <td>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(a)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingAgency && (
        <div className="admin-modal-overlay" onClick={() => { if (previewActive) resetPreview(); setEditingAgency(null); }}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>{editingAgency.id ? 'Edit Agency' : 'Create Agency'}</h3>
            <div className="admin-modal-body">
              <div className="auth-form-group">
                <label>Agency Name *</label>
                <input type="text" value={formData.agency_name} onChange={(e) => setFormData({ ...formData, agency_name: e.target.value })} placeholder="Agency name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  ['primary_color', 'Primary', '#E12627'],
                  ['secondary_color', 'Secondary', '#666'],
                  ['accent_color', 'Accent', '#0083CB'],
                  ['sidebar_bg', 'Sidebar BG', '#1a1a2e'],
                  ['sidebar_text', 'Sidebar Text', '#fff'],
                ].map(([key, label, fallback]) => (
                  <div key={key} className="auth-form-group" style={{ margin: 0 }}>
                    <label>{label}</label>
                    <input type="color" value={formData[key] || fallback} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} style={{ width: '100%', height: 36, padding: 2, cursor: 'pointer' }} />
                  </div>
                ))}
              </div>
              <div className="auth-form-group">
                <label>Font Family</label>
                <input type="text" value={formData.font_family} onChange={(e) => setFormData({ ...formData, font_family: e.target.value })} placeholder="e.g. Inter, sans-serif" />
              </div>
              <div className="auth-form-group">
                <label>Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input type="text" value={formData.logo_url} onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })} placeholder="https://... or upload below" style={{ flex: 1, minWidth: 160 }} />
                  <label
                    className="btn btn-outline btn-sm"
                    style={{ margin: 0, cursor: editingAgency.id ? 'pointer' : 'not-allowed', opacity: editingAgency.id ? 1 : 0.6 }}
                    title={editingAgency.id ? 'Upload logo' : 'Save agency first to upload logo'}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo || !editingAgency.id}
                      style={{ display: 'none' }}
                    />
                    {uploadingLogo ? 'Uploading…' : 'Or upload'}
                  </label>
                </div>
                {formData.logo_url && (
                  <div style={{ marginTop: 6 }}>
                    <img src={formData.logo_url} alt="Logo preview" style={{ maxWidth: 80, maxHeight: 40, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={applyPreview}>Preview</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={resetPreview}>Reset Preview</button>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => { if (previewActive) resetPreview(); setEditingAgency(null); }}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => { if (previewActive) resetPreview(); saveAgency(); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminUsersTab({ onMessage, setLoading, agencyId, isSuperAdmin, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [userAssignedClients, setUserAssignedClients] = useState({});
  const [search, setSearch] = useState('');
  const [manageClientsUser, setManageClientsUser] = useState(null);
  const [allPlatformAccounts, setAllPlatformAccounts] = useState([]);
  const [userClientAssignments, setUserClientAssignments] = useState({});
  const [addUserModal, setAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', full_name: '', role_id: '', agency_id: '' });
  const [addingUser, setAddingUser] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rolesData, error: rolesErr } = await supabase.from('roles').select('*');
      if (rolesErr) console.warn('[Admin] roles fetch:', rolesErr);
      setRoles(rolesData || []);

      const { data: agenciesData } = await supabase.from('agencies').select('id, agency_name');
      setAgencies(agenciesData || []);

      let query = supabase.from('user_profiles').select('id, email, full_name, role_id, agency_id').order('full_name');
      if (!isSuperAdmin && agencyId) {
        query = query.eq('agency_id', agencyId);
      }
      const { data: profiles, error } = await query;
      if (error) {
        console.error('[Admin] user_profiles fetch error:', error);
        throw error;
      }
      const agencyMap = new Map((agenciesData || []).map((a) => [a.id, a.agency_name]));
      let result = (profiles || []).map((p) => ({
        ...p,
        is_active: p.is_active ?? true,
        agencies: p.agency_id ? { agency_name: agencyMap.get(p.agency_id) || null } : null,
      }));
      if (result.length === 0 && currentUserId) {
        const { data: ownProfile } = await supabase.from('user_profiles').select('id, email, full_name, role_id, agency_id').eq('id', currentUserId).maybeSingle();
        if (ownProfile) {
          result = [{
            ...ownProfile,
            is_active: ownProfile.is_active ?? true,
            agencies: ownProfile.agency_id ? { agency_name: agencyMap.get(ownProfile.agency_id) || null } : null,
          }];
        }
      }
      setUsers(result);

      const { data: ucData } = await supabase.from('user_clients').select('user_id, client_id');
      const { data: cpaData } = await supabase.from('client_platform_accounts').select('id, account_name, platform_customer_id, agency_id');
      const cpaMap = new Map((cpaData || []).map((c) => [c.id, c.account_name || c.platform_customer_id]));
      const byUser = {};
      (ucData || []).forEach((r) => {
        if (!byUser[r.user_id]) byUser[r.user_id] = [];
        const name = cpaMap.get(r.client_id) || r.client_id;
        byUser[r.user_id].push({ client_id: r.client_id, client_name: name });
      });
      setUserAssignedClients(byUser);
    } catch (err) {
      onMessage(err.message || 'Failed to load users', true);
    } finally {
      setLoading(false);
    }
  }, [onMessage, setLoading, agencyId, isSuperAdmin, currentUserId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadAllPlatformAccounts = useCallback(async (targetAgencyId) => {
    const aid = targetAgencyId || agencyId;
    if (!aid) {
      setAllPlatformAccounts([]);
      return;
    }
    const { data } = await supabase
      .from('client_platform_accounts')
      .select('id, account_name, platform_customer_id, platform, is_active')
      .eq('agency_id', aid)
      .order('account_name');
    setAllPlatformAccounts(data || []);
  }, [agencyId]);

  const loadUserClients = useCallback(async (userId) => {
    const { data } = await supabase.from('user_clients').select('client_id').eq('user_id', userId);
    setUserClientAssignments((prev) => ({ ...prev, [userId]: new Set((data || []).map((r) => r.client_id)) }));
  }, []);

  const openManageClients = async (user) => {
    setManageClientsUser(user);
    await loadAllPlatformAccounts(user.agency_id);
    await loadUserClients(user.id);
  };

  const saveUserAgency = async (userId, newAgencyId) => {
    try {
      const { error } = await supabase.from('user_profiles').update({ agency_id: newAgencyId || null }).eq('id', userId);
      if (error) throw error;
      onMessage('Agency updated');
      loadUsers();
    } catch (err) {
      onMessage(err?.message || 'Failed to update agency', true);
    }
  };

  const saveUserRole = async (userId, roleId) => {
    try {
      const { error } = await supabase.from('user_profiles').update({ role_id: roleId || null }).eq('id', userId);
      if (error) throw error;
      onMessage('Role updated');
      loadUsers();
    } catch (err) {
      onMessage(err?.message || 'Failed to update role', true);
    }
  };

  const saveUserActive = async (userId, isActive) => {
    try {
      const { error } = await supabase.from('user_profiles').update({ is_active: isActive }).eq('id', userId);
      if (error) throw error;
      onMessage('Status updated');
      loadUsers();
    } catch (err) {
      onMessage(err.message || 'Failed to update status', true);
    }
  };

  const saveUserClients = async () => {
    if (!manageClientsUser) return;
    try {
      const assigned = userClientAssignments[manageClientsUser.id] || new Set();
      const { error: delErr } = await supabase.from('user_clients').delete().eq('user_id', manageClientsUser.id);
      if (delErr) throw delErr;
      if (assigned.size) {
        const rows = [...assigned].map((client_id) => ({ user_id: manageClientsUser.id, client_id }));
        const { error: insErr } = await supabase.from('user_clients').insert(rows);
        if (insErr) throw insErr;
      }
      onMessage('Client assignments saved');
      setManageClientsUser(null);
      loadUsers();
    } catch (err) {
      onMessage(err?.message || 'Failed to save', true);
    }
  };

  const createUser = async () => {
    const { email, password, full_name, role_id, agency_id } = newUserForm;
    if (!email?.trim()) {
      onMessage('Email is required', true);
      return;
    }
    if (!password || password.length < 6) {
      onMessage('Password must be at least 6 characters', true);
      return;
    }
    setAddingUser(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const prevSession = sessionData?.session;

      const { data, error } = await supabase.auth.signUp({
        email: String(email).trim(),
        password: String(password),
        options: { data: { full_name: full_name?.trim() || null } },
      });
      if (error) throw error; // User already exists, etc.

      const newUserId = data?.user?.id;
      if (!newUserId) throw new Error('User created but no ID returned');

      const updates = {};
      if (role_id) updates.role_id = role_id;
      if (agency_id && isSuperAdmin) updates.agency_id = agency_id;
      else if (agencyId && !isSuperAdmin) updates.agency_id = agencyId;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase.from('user_profiles').update(updates).eq('id', newUserId);
        if (updErr) console.warn('[Admin] user_profiles update after create:', updErr);
      }

      if (prevSession) {
        await supabase.auth.setSession({
          access_token: prevSession.access_token,
          refresh_token: prevSession.refresh_token,
        });
      }

      onMessage('User created successfully');
      setAddUserModal(false);
      setNewUserForm({ email: '', password: '', full_name: '', role_id: '', agency_id: '' });
      loadUsers();
    } catch (err) {
      onMessage(err?.message || 'Failed to create user', true);
    } finally {
      setAddingUser(false);
    }
  };

  const toggleClient = (userId, clientId) => {
    setUserClientAssignments((prev) => {
      const prevSet = prev[userId] || new Set();
      const next = new Set(prevSet);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return { ...prev, [userId]: next };
    });
  };

  const filtered = users.filter((u) => {
    const s = search.toLowerCase();
    return !s || (u.full_name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s);
  });

  return (
    <div className="admin-card">
      <div className="admin-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search"
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddUserModal(true)}>
          Add User
        </button>
      </div>
      <div className="table-wrapper">
        <table className="data-table gads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Agency</th>
              <th>Role</th>
              <th>Active</th>
              <th>Assigned Clients</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {users.length === 0
                  ? 'No users found. Check browser console for errors. Ensure your user has is_super_admin=true or admin role in user_profiles for RLS to allow reading other users.'
                  : 'No users match your search.'}
                </td>
              </tr>
            ) : filtered.map((u) => {
              const assigned = userAssignedClients[u.id] || [];
              const assignedLabel = assigned.length === 0
                ? '—'
                : assigned.length <= 2
                  ? assigned.map((a) => a.client_name).join(', ')
                  : `${assigned.length} accounts`;
              return (
                <tr key={u.id}>
                  <td>{u.full_name || u.name || u.email?.split('@')[0] || '—'}</td>
                  <td>{u.email}</td>
                  <td>
                    {isSuperAdmin ? (
                      <select
                        className="admin-role-select"
                        value={u.agency_id || ''}
                        onChange={(e) => saveUserAgency(u.id, e.target.value || null)}
                      >
                        <option value="">— No agency —</option>
                        {agencies.map((a) => (
                          <option key={a.id} value={a.id}>{a.agency_name || a.id}</option>
                        ))}
                      </select>
                    ) : (
                      u.agencies?.agency_name || '—'
                    )}
                  </td>
                  <td>
                    <select
                      className="admin-role-select"
                      value={roles.some((r) => r.id === u.role_id) ? u.role_id : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        saveUserRole(u.id, val || null);
                      }}
                    >
                      <option value="">— Select role —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name || r.role_name || String(r.id)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={!!u.is_active}
                        onChange={(e) => saveUserActive(u.id, e.target.checked)}
                      />
                      <span />
                    </label>
                  </td>
                  <td title={assigned.map((a) => a.client_name).join(', ')}>{assignedLabel}</td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openManageClients(u)} title="Manage assigned clients">
                      Manage Clients
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manageClientsUser && (
        <div className="admin-modal-overlay" onClick={() => setManageClientsUser(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Manage Assigned Accounts: {manageClientsUser.full_name || manageClientsUser.email}</h3>
            <div className="admin-modal-body">
              {allPlatformAccounts.length === 0 ? (
                <p className="admin-modal-empty">No platform accounts found. Add accounts in the Clients tab first.</p>
              ) : (
                allPlatformAccounts.map((c) => (
                  <label key={c.id} className="admin-checkbox-row">
                    <input
                      type="checkbox"
                      checked={(userClientAssignments[manageClientsUser.id] || new Set()).has(c.id)}
                      onChange={() => toggleClient(manageClientsUser.id, c.id)}
                    />
                    {c.account_name || c.platform_customer_id}
                    {c.is_active === false && <span className="admin-badge-inactive"> inactive</span>}
                  </label>
                ))
              )}
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setManageClientsUser(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={saveUserClients}>Save</button>
            </div>
          </div>
        </div>
      )}

      {addUserModal && (
        <div className="admin-modal-overlay" onClick={() => !addingUser && setAddUserModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Add User</h3>
            <div className="admin-modal-body">
              <div className="auth-form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                />
              </div>
              <div className="auth-form-group">
                <label>Password * (min 6 chars)</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <div className="auth-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={newUserForm.full_name}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div className="auth-form-group">
                <label>Role</label>
                <select
                  className="admin-role-select"
                  value={newUserForm.role_id}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, role_id: e.target.value }))}
                >
                  <option value="">— Select role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name || r.role_name || String(r.id)}</option>
                  ))}
                </select>
              </div>
              {isSuperAdmin && (
                <div className="auth-form-group">
                  <label>Agency</label>
                  <select
                    className="admin-role-select"
                    value={newUserForm.agency_id}
                    onChange={(e) => setNewUserForm((f) => ({ ...f, agency_id: e.target.value }))}
                  >
                    <option value="">— No agency —</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>{a.agency_name || a.id}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => !addingUser && setAddUserModal(false)} disabled={addingUser}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={createUser} disabled={addingUser}>{addingUser ? 'Creating…' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminRolesTab({ onMessage, setLoading }) {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [editingRole, setEditingRole] = useState(null);
  const [pendingPermissions, setPendingPermissions] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [newRoleModal, setNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const loadRoles = useCallback(async () => {
    const { data, error } = await supabase.from('roles').select('*');
    if (error) {
      console.warn('[Admin] roles:', error);
      setRoles([]);
      return;
    }
    setRoles((data || []).sort((a, b) => (a.name || a.role_name || '').localeCompare(b.name || b.role_name || '')));
  }, []);

  const loadPermissions = useCallback(async () => {
    const { data, error } = await supabase.from('permissions').select('*').order('category').order('permission_key');
    if (error) console.warn('[Admin] permissions:', error);
    setPermissions(data || []);
  }, []);

  const loadRolePermissions = useCallback(async (roleId) => {
    const { data } = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId);
    setPendingPermissions(new Set((data || []).map((r) => r.permission_id)));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRoles(), loadPermissions()]).finally(() => setLoading(false));
  }, [loadRoles, loadPermissions, setLoading]);

  useEffect(() => {
    if (editingRole) loadRolePermissions(editingRole.id);
  }, [editingRole, loadRolePermissions]);

  const togglePermission = (permissionId) => {
    setPendingPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const saveRolePermissions = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      const { error: delErr } = await supabase.from('role_permissions').delete().eq('role_id', editingRole.id);
      if (delErr) throw delErr;
      if (pendingPermissions.size > 0) {
        const rows = [...pendingPermissions].map((permission_id) => ({ role_id: editingRole.id, permission_id }));
        const { error: insErr } = await supabase.from('role_permissions').insert(rows);
        if (insErr) throw insErr;
      }
      onMessage('Permissions saved');
    } catch (err) {
      onMessage(err?.message || 'Failed to save', true);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const { error } = await supabase.from('roles').insert({ role_name: newRoleName.trim(), description: newRoleDesc.trim() || null });
      if (error) throw error;
      onMessage('Role created');
      setNewRoleModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      loadRoles();
    } catch (err) {
      onMessage(err?.message || 'Failed to create role', true);
    }
  };

  const byCategory = permissions.reduce((acc, p) => {
    const c = p.category || 'other';
    if (!acc[c]) acc[c] = [];
    acc[c].push(p);
    return acc;
  }, {});

  const roleDisplayName = (r) => r.role_name || r.name || r.id;

  return (
    <div className="admin-card">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setNewRoleModal(true)}>Create New Role</button>
      </div>
      <div className="admin-roles-grid">
        <div className="admin-roles-list">
          <div className="admin-roles-section-label">Roles</div>
          {roles.length === 0 ? (
            <p className="admin-empty-hint">No roles found. Create one above.</p>
          ) : (
            roles.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`admin-role-btn ${editingRole?.id === r.id ? 'active' : ''}`}
                onClick={() => setEditingRole(r)}
              >
                <span className="admin-role-name">{roleDisplayName(r)}</span>
                {r.description && <span className="admin-role-desc">{r.description}</span>}
              </button>
            ))
          )}
        </div>
        <div className="admin-permissions-editor">
          {editingRole ? (
            <>
              <div className="admin-permissions-header">
                <div>
                  <h4>{roleDisplayName(editingRole)}</h4>
                  {editingRole.description && <p className="admin-role-desc-block">{editingRole.description}</p>}
                </div>
                <button type="button" className="btn btn-primary" onClick={saveRolePermissions} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
              {CATEGORIES.map((cat) => (
                <div key={cat} className="admin-perm-group">
                  <div className="admin-perm-group-label">{cat}</div>
                  {byCategory[cat]?.map((p) => (
                    <label key={p.id} className="admin-checkbox-row">
                      <input
                        type="checkbox"
                        checked={pendingPermissions.has(p.id)}
                        onChange={() => togglePermission(p.id)}
                      />
                      {p.permission_label || p.permission_key}
                    </label>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <div className="admin-select-role-hint">
              <p>Select a role on the left to edit its permissions.</p>
            </div>
          )}
        </div>
      </div>

      {newRoleModal && (
        <div className="admin-modal-overlay" onClick={() => setNewRoleModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Role</h3>
            <div className="admin-modal-body">
              <div className="auth-form-group">
                <label>Name</label>
                <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Role name" />
              </div>
              <div className="auth-form-group">
                <label>Description</label>
                <input type="text" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setNewRoleModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={createRole}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminClientsTab({ onMessage, setLoading, agencyId, isSuperAdmin }) {
  const [accounts, setAccounts] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [formData, setFormData] = useState({ platform: 'google_ads', platform_customer_id: '', account_name: '', agency_id: '' });
  const [allAgencies, setAllAgencies] = useState([]);

  const loadAccounts = useCallback(async () => {
    if (!isSuperAdmin && !agencyId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('client_platform_accounts')
        .select('*, agencies(agency_name)')
        .order('account_name');
      if (!isSuperAdmin) {
        query = query.eq('agency_id', agencyId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      onMessage(err.message || 'Failed to load accounts', true);
    } finally {
      setLoading(false);
    }
  }, [agencyId, isSuperAdmin, onMessage, setLoading]);

  const loadAgencies = useCallback(async () => {
    if (!isSuperAdmin) return;
    const { data } = await supabase.from('agencies').select('id, agency_name').order('agency_name');
    setAllAgencies(data || []);
  }, [isSuperAdmin]);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const addAccount = async () => {
    const targetAgencyId = isSuperAdmin ? formData.agency_id : agencyId;
    if (!targetAgencyId) {
      onMessage(isSuperAdmin ? 'Please select an agency' : 'No agency assigned', true);
      return;
    }
    if (!formData.platform || !formData.platform_customer_id?.trim()) {
      onMessage('Platform and Platform Customer ID are required', true);
      return;
    }
    try {
      const { data: creds } = await supabase
        .from('agency_platform_credentials')
        .select('id')
        .eq('agency_id', targetAgencyId)
        .eq('platform', formData.platform)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const credentialId = creds?.id ?? null;
      const { error } = await supabase.from('client_platform_accounts').insert({
        agency_id: targetAgencyId,
        credential_id: credentialId,
        platform: formData.platform,
        platform_customer_id: formData.platform_customer_id.trim(),
        account_name: formData.account_name?.trim() || formData.platform_customer_id.trim(),
        is_active: true,
      });
      if (error) throw error;
      onMessage('Account added');
      setAddModal(false);
      setFormData({ platform: 'google_ads', platform_customer_id: '', account_name: '', agency_id: '' });
      loadAccounts();
    } catch (err) {
      onMessage(err?.message || 'Failed to add', true);
    }
  };

  const deleteAccount = async (account) => {
    if (!confirm('Delete this account?')) return;
    try {
      const { error } = await supabase.from('client_platform_accounts').delete().eq('id', account.id);
      if (error) throw error;
      onMessage('Account deleted');
      loadAccounts();
    } catch (err) {
      onMessage(err?.message || 'Failed', true);
    }
  };

  const toggleActive = async (account) => {
    try {
      const { error } = await supabase
        .from('client_platform_accounts')
        .update({ is_active: !account.is_active })
        .eq('id', account.id);
      if (error) throw error;
      onMessage('Status updated');
      loadAccounts();
    } catch (err) {
      onMessage(err?.message || 'Failed', true);
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setFormData({ platform: 'google_ads', platform_customer_id: '', account_name: '', agency_id: isSuperAdmin && agencyId ? agencyId : '' }); setAddModal(true); }}>
          Add Account
        </button>
      </div>
      {!isSuperAdmin && !agencyId ? (
        <p className="admin-empty-hint">No agency assigned. You must have an agency to manage accounts.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table gads-table admin-clients-table">
            <thead>
              <tr>
                <th>Account Name</th>
                {isSuperAdmin && <th>Agency</th>}
                <th>Platform</th>
                <th>Customer ID</th>
                <th>Active</th>
                <th>Last Synced</th>
                <th>Last Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.account_name || '—'}</td>
                  {isSuperAdmin && <td>{a.agencies?.agency_name || ''}</td>}
                  <td><span className="admin-platform-badge">{a.platform}</span></td>
                  <td>{a.platform_customer_id}</td>
                  <td>
                    <label className="admin-toggle">
                      <input type="checkbox" checked={!!a.is_active} onChange={() => toggleActive(a)} />
                      <span />
                    </label>
                  </td>
                  <td>{formatRelativeTime(a.last_sync_at)}</td>
                  <td>{statusBadge(a.sync_status)}</td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => deleteAccount(a)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addModal && (
        <div className="admin-modal-overlay" onClick={() => setAddModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Account</h3>
            <div className="admin-modal-body">
              {isSuperAdmin && (
                <div className="auth-form-group">
                  <label>Agency *</label>
                  <select value={formData.agency_id || ''} onChange={(e) => setFormData({ ...formData, agency_id: e.target.value })} required>
                    <option value="">Select agency...</option>
                    {allAgencies.map((a) => (
                      <option key={a.id} value={a.id}>{a.agency_name || a.id}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="auth-form-group">
                <label>Platform *</label>
                <select value={formData.platform || ''} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} required>
                  <option value="">Select platform...</option>
                  {CLIENT_PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="auth-form-group">
                <label>Platform Customer ID *</label>
                <input type="text" value={formData.platform_customer_id || ''} onChange={(e) => setFormData({ ...formData, platform_customer_id: e.target.value })} placeholder="e.g. 3969168045 for Google Ads" required />
              </div>
              <div className="auth-form-group">
                <label>Account Name</label>
                <input type="text" value={formData.account_name || ''} onChange={(e) => setFormData({ ...formData, account_name: e.target.value })} placeholder="Optional display name" />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setAddModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={addAccount}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPermissionsTab({ onMessage, setLoading }) {
  const [permissions, setPermissions] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [seeding, setSeeding] = useState(false);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('permissions').select('*').order('category').order('permission_key');
    setPermissions(data || []);
    setLoading(false);
  }, [setLoading]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const seedDefaultPermissions = async () => {
    setSeeding(true);
    try {
      const { data: existing } = await supabase.from('permissions').select('permission_key');
      const existingKeys = new Set((existing || []).map((p) => p.permission_key));
      const toInsert = DEFAULT_PERMISSIONS.filter((p) => !existingKeys.has(p.permission_key));
      if (toInsert.length === 0) {
        onMessage('All default permissions already exist');
        return;
      }
      const { error } = await supabase.from('permissions').insert(toInsert);
      if (error) throw error;
      onMessage(`Seeded ${toInsert.length} new permissions`);
      loadPermissions();
    } catch (err) {
      onMessage(err?.message || 'Failed to seed', true);
    } finally {
      setSeeding(false);
    }
  };

  const createPermission = async () => {
    if (!formData.permission_key?.trim()) return;
    try {
      await supabase.from('permissions').insert({
        permission_key: formData.permission_key.trim(),
        permission_label: formData.permission_label?.trim() || formData.permission_key.trim(),
        category: formData.category || 'sidebar',
      });
      onMessage('Permission created');
      setAddModal(false);
      setFormData({});
      loadPermissions();
    } catch (err) {
      onMessage(err.message || 'Failed', true);
    }
  };

  const deletePermission = async (id) => {
    if (!confirm('Delete this permission? This may affect role assignments.')) return;
    try {
      await supabase.from('permissions').delete().eq('id', id);
      onMessage('Permission deleted');
      loadPermissions();
    } catch (err) {
      onMessage(err.message || 'Failed', true);
    }
  };

  const byCategory = permissions.reduce((acc, p) => {
    const c = p.category || 'other';
    if (!acc[c]) acc[c] = [];
    acc[c].push(p);
    return acc;
  }, {});

  return (
    <div className="admin-card">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setFormData({}); setAddModal(true); }}>Add New Permission</button>
        <button type="button" className="btn btn-outline" onClick={seedDefaultPermissions} disabled={seeding}>
          {seeding ? 'Seeding…' : 'Seed Default Permissions'}
        </button>
      </div>
      <div className="admin-permissions-list">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="admin-perm-group">
            <div className="admin-perm-group-label">{cat}</div>
            <table className="data-table gads-table">
              <tbody>
                {(byCategory[cat] || []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.permission_key}</td>
                    <td>{p.permission_label || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => deletePermission(p.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {addModal && (
        <div className="admin-modal-overlay" onClick={() => setAddModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add New Permission</h3>
            <div className="admin-modal-body">
              <div className="auth-form-group">
                <label>Permission Key</label>
                <input type="text" value={formData.permission_key || ''} onChange={(e) => setFormData({ ...formData, permission_key: e.target.value })} placeholder="e.g. sidebar.analytics" />
              </div>
              <div className="auth-form-group">
                <label>Display Label</label>
                <input type="text" value={formData.permission_label || ''} onChange={(e) => setFormData({ ...formData, permission_label: e.target.value })} />
              </div>
              <div className="auth-form-group">
                <label>Category</label>
                <select value={formData.category || 'sidebar'} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setAddModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={createPermission}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_REPORT_TABS = [
  { tab_key: 'daily', tab_label: 'Daily Breakdown', tab_order: 1, required_permission: 'tab.daily_breakdown' },
  { tab_key: 'campaigntypes', tab_label: 'Campaign Types', tab_order: 2, required_permission: 'tab.overview' },
  { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 3, required_permission: 'tab.campaigns' },
  { tab_key: 'adgroups', tab_label: 'Ad Groups', tab_order: 4, required_permission: 'tab.ad_groups' },
  { tab_key: 'keywords', tab_label: 'Keywords', tab_order: 5, required_permission: 'tab.keywords' },
  { tab_key: 'searchterms', tab_label: 'Search Terms', tab_order: 6, required_permission: 'tab.search_terms' },
  { tab_key: 'geo', tab_label: 'Geo', tab_order: 7, required_permission: 'tab.geo' },
  { tab_key: 'conversions', tab_label: 'Conversions', tab_order: 8, required_permission: 'tab.conversions' },
];

function AdminReportTabsTab({ onMessage, setLoading, agencyId }) {
  const [tabs, setTabs] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const loadTabs = useCallback(async () => {
    if (!agencyId) {
      setTabs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agency_report_tabs')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('platform', 'google_ads')
        .order('tab_order');
      if (error) throw error;
      setTabs(data && data.length > 0 ? data : DEFAULT_REPORT_TABS.map((t, i) => ({ ...t, agency_id: agencyId, id: null, is_visible: true })));
    } catch (err) {
      onMessage(err?.message || 'Failed to load', true);
    } finally {
      setLoading(false);
    }
  }, [agencyId, onMessage, setLoading]);

  const loadPermissions = useCallback(async () => {
    const { data } = await supabase.from('permissions').select('id, permission_key, permission_label').eq('category', 'report_tab').order('permission_key');
    setPermissions(data || []);
  }, []);

  useEffect(() => { loadTabs(); loadPermissions(); }, [loadTabs, loadPermissions]);

  const moveTab = async (index, direction) => {
    const newTabs = [...tabs];
    const swap = index + (direction === 'up' ? -1 : 1);
    if (swap < 0 || swap >= newTabs.length) return;
    [newTabs[index], newTabs[swap]] = [newTabs[swap], newTabs[index]];
    newTabs.forEach((t, i) => { t.tab_order = i + 1; });
    setTabs(newTabs);
    await saveTabs(newTabs);
  };

  const saveTabs = async (tabsToSave = tabs) => {
    if (!agencyId) return;
    try {
      const { error: delErr } = await supabase.from('agency_report_tabs').delete().eq('agency_id', agencyId).eq('platform', 'google_ads');
      if (delErr) throw delErr;
      const rows = tabsToSave.map((t, i) => ({
        agency_id: agencyId,
        tab_key: t.tab_key,
        tab_label: t.tab_label || t.tab_key,
        tab_order: i + 1,
        is_visible: t.is_visible !== false,
        required_permission: t.required_permission || null,
        platform: 'google_ads',
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('agency_report_tabs').insert(rows);
        if (insErr) throw insErr;
      }
      onMessage('Report tabs saved');
      loadTabs();
    } catch (err) {
      onMessage(err?.message || 'Failed to save', true);
    }
  };

  const updateTab = (index, field, value) => {
    const newTabs = [...tabs];
    newTabs[index] = { ...newTabs[index], [field]: value };
    setTabs(newTabs);
  };

  const toggleVisible = (index) => {
    updateTab(index, 'is_visible', !tabs[index].is_visible);
  };

  if (!agencyId) {
    return <p className="admin-empty-hint">No agency assigned. You must have an agency to configure report tabs.</p>;
  }

  return (
    <div className="admin-card">
      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => saveTabs()}>Save Report Tabs</button>
      </div>
      <p className="help-text" style={{ marginBottom: 16 }}>Configure which tabs appear on the Google Ads page for your agency. Reorder, show/hide, and assign permissions.</p>
      <div className="table-wrapper">
        <table className="data-table gads-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Order</th>
              <th>Tab</th>
              <th>Label</th>
              <th>Required Permission</th>
              <th>Visible</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tabs.map((t, i) => (
              <tr key={t.tab_key || i}>
                <td>
                  <button type="button" className="btn btn-outline btn-sm btn-xs" onClick={() => moveTab(i, 'up')} disabled={i === 0}>↑</button>
                  <button type="button" className="btn btn-outline btn-sm btn-xs" onClick={() => moveTab(i, 'down')} disabled={i === tabs.length - 1}>↓</button>
                </td>
                <td>{t.tab_key}</td>
                <td>
                  <input
                    type="text"
                    value={t.tab_label || ''}
                    onChange={(e) => updateTab(i, 'tab_label', e.target.value)}
                    style={{ width: '100%', maxWidth: 180, padding: '6px 8px', fontSize: 12 }}
                  />
                </td>
                <td>
                  <select
                    value={t.required_permission || ''}
                    onChange={(e) => updateTab(i, 'required_permission', e.target.value || null)}
                    style={{ minWidth: 160, padding: '6px 8px', fontSize: 12 }}
                  >
                    <option value="">— None —</option>
                    {permissions.map((p) => (
                      <option key={p.id} value={p.permission_key}>{p.permission_label || p.permission_key}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={t.is_visible !== false} onChange={() => toggleVisible(i)} />
                    <span />
                  </label>
                </td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
