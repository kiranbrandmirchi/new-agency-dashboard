import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const PLATFORMS = ['google_ads', 'facebook_ads', 'bing_ads', 'tiktok_ads', 'pinterest_ads', 'reddit_ads', 'snapchat_ads', 'linkedin_ads'];
const CLIENT_PLATFORMS = ['google_ads', 'reddit', 'meta', 'bing', 'tiktok', 'ga4', 'ghl'];

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
import { PLATFORM_PERMISSIONS, PLATFORM_REPORT_TABS, getAllPlatformPermissions, PLATFORM_LABELS } from '../config/platformConfig';
import { getEffectiveAgencyScopeId } from '../lib/agencyScope';

const CATEGORIES = ['global', 'action', 'sidebar', 'report_tab', 'customer'];

function getCategoryDisplayLabel(cat) {
  if (cat?.startsWith('report_tab_')) {
    const platform = cat.replace('report_tab_', '');
    return `Report Tabs: ${PLATFORM_LABELS[platform] || platform.replace(/_/g, ' ')}`;
  }
  const labels = { global: 'Global', action: 'Actions', sidebar: 'Sidebar', customer: 'Customer', report_tab: 'Report Tabs', other: 'Other' };
  return labels[cat] || cat;
}

export function Admin() {
  const { user, agencyId, activeAgencyId, userProfile, userRole } = useAuth();
  const isSuperAdmin = userProfile?.is_super_admin || userRole?.toLowerCase() === 'super_admin';
  const adminAgencyId = getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId);
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
        {activeTab === 'users' && <AdminUsersTab onMessage={showMessage} setLoading={setLoading} agencyId={adminAgencyId} isSuperAdmin={isSuperAdmin} currentUserId={user?.id} />}
        {activeTab === 'roles' && <AdminRolesTab onMessage={showMessage} setLoading={setLoading} />}
        {activeTab === 'clients' && <AdminClientsTab onMessage={showMessage} setLoading={setLoading} agencyId={adminAgencyId} isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'permissions' && <AdminPermissionsTab onMessage={showMessage} setLoading={setLoading} />}
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
      .select('id, account_name, platform_customer_id, platform, is_active, client_id, clients(name)')
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

  const toggleClientGroup = (userId, accountIds, isAdding) => {
    setUserClientAssignments((prev) => {
      const prevSet = prev[userId] || new Set();
      const next = new Set(prevSet);
      accountIds.forEach((id) => (isAdding ? next.add(id) : next.delete(id)));
      return { ...prev, [userId]: next };
    });
  };

  const buildAccountGroups = useCallback((accounts) => {
    const byClient = new Map();
    const ungrouped = [];
    (accounts || []).forEach((a) => {
      if (a.client_id && a.clients?.name) {
        if (!byClient.has(a.client_id)) byClient.set(a.client_id, { name: a.clients.name, ids: [], accounts: [] });
        const g = byClient.get(a.client_id);
        g.ids.push(a.id);
        g.accounts.push(a);
      } else {
        ungrouped.push({ name: a.account_name || a.platform_customer_id, ids: [a.id], accounts: [a], isClient: false });
      }
    });
    return [
      ...[...byClient.values()].map((g) => ({ ...g, isClient: true })),
      ...ungrouped,
    ];
  }, []);

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
            <p className="help-text" style={{ margin: '0 0 12px', fontSize: 12 }}>Clients group multiple accounts (e.g. Wow Presents Plus) so one checkbox grants access to all.</p>
            <div className="admin-modal-body">
              {allPlatformAccounts.length === 0 ? (
                <p className="admin-modal-empty">No platform accounts found. Add accounts in the Clients tab first.</p>
              ) : (
                buildAccountGroups(allPlatformAccounts).map((g, i) => {
                  const assigned = userClientAssignments[manageClientsUser.id] || new Set();
                  const allAssigned = g.ids.every((id) => assigned.has(id));
                  return (
                    <label key={g.ids[0] || i} className="admin-checkbox-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={allAssigned}
                          onChange={() => toggleClientGroup(manageClientsUser.id, g.ids, !allAssigned)}
                        />
                        <span>{g.name}</span>
                      </div>
                      {g.accounts?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 24 }}>
                          {g.accounts.map((acc) => (
                            <span key={acc.id} className="admin-platform-badge" style={{ fontSize: 10 }}>{acc.platform}</span>
                          ))}
                        </div>
                      )}
                    </label>
                  );
                })
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

  const categoryOrder = ['global', 'action', 'sidebar', 'customer'];
  const orderedCategories = [
    ...categoryOrder.filter((c) => byCategory[c]?.length),
    ...Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)).sort(),
  ];

  const selectAllInCategory = (cat) => {
    const perms = byCategory[cat] || [];
    setPendingPermissions((prev) => {
      const next = new Set(prev);
      perms.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const clearCategory = (cat) => {
    const permIds = new Set((byCategory[cat] || []).map((p) => p.id));
    setPendingPermissions((prev) => {
      const next = new Set(prev);
      permIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const roleDisplayName = (r) => r.role_name || r.name || r.id;

  return (
    <div className="admin-card">
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={() => setNewRoleModal(true)}>Create New Role</button>
        <div className="admin-role-select-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="admin-roles-section-label" style={{ marginBottom: 0 }}>Assign Permissions to Role</label>
          <select
            className="admin-role-select"
            value={editingRole?.id || ''}
            onChange={(e) => {
              const id = e.target.value;
              setEditingRole(roles.find((r) => r.id === id) || null);
            }}
          >
            <option value="">— Select a role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{roleDisplayName(r)}</option>
            ))}
          </select>
        </div>
      </div>

      {editingRole && (
        <p className="help-text" style={{ marginBottom: 16 }}>
          Editing Role: <strong>{roleDisplayName(editingRole)}</strong>
          {editingRole.description && ` — ${editingRole.description}`}
        </p>
      )}

      <div className="admin-permissions-editor">
        {editingRole ? (
          <>
            <div className="admin-permissions-header">
              <div />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingRole(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={saveRolePermissions} disabled={saving}>
                  {saving ? 'Saving…' : 'Save permissions for this role'}
                </button>
              </div>
            </div>
            {orderedCategories.map((cat) => {
              const perms = byCategory[cat] || [];
              if (perms.length === 0) return null;
              return (
                <div key={cat} className="admin-perm-group">
                  <div className="admin-perm-group-header">
                    <span className="admin-perm-group-label">{getCategoryDisplayLabel(cat)}</span>
                    <div className="admin-perm-group-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => selectAllInCategory(cat)}>
                        Select All
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => clearCategory(cat)}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="admin-perm-checkboxes">
                    {perms.map((p) => (
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
                </div>
              );
            })}
          </>
        ) : (
          <div className="admin-select-role-hint">
            <p>Select a role above to assign permissions.</p>
          </div>
        )}
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
  const [clients, setClients] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [addClientModal, setAddClientModal] = useState(false);
  const [addClientAgencyId, setAddClientAgencyId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [formData, setFormData] = useState({
    platform: 'google_ads',
    platform_customer_id: '',
    account_name: '',
    agency_id: '',
    platform_api_key: '',
  });
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
        .select('*, agencies(agency_name), clients(id, name)')
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

  const loadClients = useCallback(async () => {
    try {
      if (!isSuperAdmin && !agencyId) {
        setClients([]);
        return;
      }
      let query = supabase.from('clients').select('id, name, agency_id').order('name');
      if (!isSuperAdmin) {
        query = query.eq('agency_id', agencyId);
      }
      const { data } = await query;
      setClients(data || []);
    } catch (err) {
      setClients([]);
    }
  }, [agencyId, isSuperAdmin]);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);
  useEffect(() => { loadClients(); }, [loadClients, agencyId]);
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
      let credentialId = null;
      if (formData.platform !== 'ghl') {
        const { data: creds } = await supabase
          .from('agency_platform_credentials')
          .select('id')
          .eq('agency_id', targetAgencyId)
          .eq('platform', formData.platform)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        credentialId = creds?.id ?? null;
      }
      const row = {
        agency_id: targetAgencyId,
        credential_id: credentialId,
        platform: formData.platform,
        platform_customer_id: formData.platform_customer_id.trim(),
        account_name: formData.account_name?.trim() || formData.platform_customer_id.trim(),
        is_active: true,
      };
      if (formData.platform === 'ghl') {
        const k = formData.platform_api_key?.trim();
        if (k) row.platform_api_key = k;
      }
      const { error } = await supabase.from('client_platform_accounts').insert(row);
      if (error) throw error;
      onMessage('Account added');
      setAddModal(false);
      setFormData({ platform: 'google_ads', platform_customer_id: '', account_name: '', agency_id: '', platform_api_key: '' });
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

  const createClient = async () => {
    const targetAgencyId = isSuperAdmin ? (addClientAgencyId || agencyId) : agencyId;
    if (!targetAgencyId) {
      onMessage(isSuperAdmin ? 'Select an agency first' : 'No agency assigned', true);
      return;
    }
    if (!newClientName?.trim()) {
      onMessage('Client name is required', true);
      return;
    }
    try {
      const { error } = await supabase.from('clients').insert({
        agency_id: targetAgencyId,
        name: newClientName.trim(),
      });
      if (error) throw error;
      onMessage('Client created');
      setAddClientModal(false);
      setNewClientName('');
      loadClients();
    } catch (err) {
      onMessage(err?.message || 'Failed', true);
    }
  };

  const updateAccountClientId = async (accountId, clientId) => {
    const { error } = await supabase
      .from('client_platform_accounts')
      .update({ client_id: clientId })
      .eq('id', accountId);
    if (error) onMessage(error.message, true);
    else { onMessage('Client assigned'); loadAccounts(); }
  };

  return (
    <div className="admin-card">
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setFormData({
              platform: 'google_ads',
              platform_customer_id: '',
              account_name: '',
              agency_id: isSuperAdmin && agencyId ? agencyId : '',
              platform_api_key: '',
            });
            setAddModal(true);
          }}
        >
          Add Account
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setAddClientModal(true)}>
          Create Client
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
                <th>Client</th>
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
                  <td>
                    <select
                      value={a.client_id || ''}
                      onChange={(e) => updateAccountClientId(a.id, e.target.value || null)}
                      style={{ fontSize: 12, padding: '4px 8px', minWidth: 140 }}
                    >
                      <option value="">— None —</option>
                      {clients
                        .filter((c) => c.agency_id === a.agency_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </td>
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
                    <option key={p} value={p}>{PLATFORM_LABELS[p] || p.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="auth-form-group">
                <label>{formData.platform === 'ghl' ? 'GHL Location ID *' : 'Platform Customer ID *'}</label>
                <input
                  type="text"
                  value={formData.platform_customer_id || ''}
                  onChange={(e) => setFormData({ ...formData, platform_customer_id: e.target.value })}
                  placeholder={formData.platform === 'ghl' ? 'Sub-account / location ID from GHL' : 'e.g. 3969168045 for Google Ads'}
                  required
                />
              </div>
              {formData.platform === 'ghl' && (
                <div className="auth-form-group">
                  <label>GHL API key</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={formData.platform_api_key || ''}
                    onChange={(e) => setFormData({ ...formData, platform_api_key: e.target.value })}
                    placeholder="Private Integration token (optional if set in Settings → Platforms)"
                  />
                  <p className="help-text" style={{ marginTop: 6, fontSize: 12 }}>
                    Stored on this client account for sync. You can also add or update it under Settings → Platforms &amp; integrations.
                  </p>
                </div>
              )}
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

      {addClientModal && (
        <div className="admin-modal-overlay" onClick={() => setAddClientModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Client</h3>
            <p className="help-text" style={{ marginBottom: 12 }}>Group multiple accounts (e.g. Wow Presents Plus) so they appear as one in user assignments.</p>
            <div className="admin-modal-body">
              {isSuperAdmin && (
                <div className="auth-form-group">
                  <label>Agency *</label>
                  <select value={addClientAgencyId || agencyId || ''} onChange={(e) => setAddClientAgencyId(e.target.value)}>
                    <option value="">Select agency...</option>
                    {allAgencies.map((a) => (
                      <option key={a.id} value={a.id}>{a.agency_name || a.id}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="auth-form-group">
                <label>Client Name *</label>
                <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="e.g. Wow Presents Plus" />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setAddClientModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={createClient}>Create</button>
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
      const toInsert = getAllPlatformPermissions().filter((p) => !existingKeys.has(p.permission_key));
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

  const LEGACY_REPORT_TAB_KEYS = [
    'tab.daily_breakdown', 'tab.overview', 'tab.campaigns', 'tab.ad_groups',
    'tab.keywords', 'tab.search_terms', 'tab.geo', 'tab.conversions',
    'tab.account_breakdown',
  ];

  const removeLegacyPermissions = async () => {
    if (!confirm('Remove legacy report tab permissions? (tab.daily_breakdown, tab.geo, etc.) These are replaced by the new platform-prefixed format. Role assignments for these will be removed.')) return;
    setSeeding(true);
    try {
      const { data: toDelete } = await supabase.from('permissions').select('id').in('permission_key', LEGACY_REPORT_TAB_KEYS);
      if (!toDelete?.length) {
        onMessage('No legacy permissions found');
        return;
      }
      const ids = toDelete.map((p) => p.id);
      const { error } = await supabase.from('permissions').delete().in('id', ids);
      if (error) throw error;
      onMessage(`Removed ${ids.length} legacy permission(s)`);
      loadPermissions();
    } catch (err) {
      onMessage(err?.message || 'Failed to remove', true);
    } finally {
      setSeeding(false);
    }
  };

  const syncFromReportTabs = async () => {
    setSeeding(true);
    try {
      const { data: existing } = await supabase.from('permissions').select('permission_key');
      const existingKeys = new Set((existing || []).map((p) => p.permission_key));

      const { data: tabData } = await supabase.from('agency_report_tabs').select('required_permission, tab_label, tab_key');
      const byKey = {};
      (tabData || []).forEach((t) => {
        const key = t.required_permission || (t.tab_key ? (String(t.tab_key).startsWith('tab.') ? t.tab_key : `tab.${t.tab_key}`) : null);
        if (key && !byKey[key]) {
          byKey[key] = t.tab_label || key.replace(/^tab\./, '').replace(/_/g, ' ');
        }
      });

      const toInsert = Object.entries(byKey)
        .filter(([key]) => !existingKeys.has(key))
        .map(([permission_key, permission_label]) => ({
          permission_key,
          permission_label: permission_label || permission_key,
          category: 'report_tab',
        }));

      if (toInsert.length === 0) {
        onMessage('All report tab permissions already exist');
        return;
      }
      const { error } = await supabase.from('permissions').insert(toInsert);
      if (error) throw error;
      onMessage(`Created ${toInsert.length} permission(s) from report tabs`);
      loadPermissions();
    } catch (err) {
      onMessage(err?.message || 'Failed to sync', true);
    } finally {
      setSeeding(false);
    }
  };

  const syncPlatformConfig = async () => {
    setSeeding(true);
    try {
      let permCount = 0;
      let tabCount = 0;

      // 1. Sync permissions from platform config (global + all platform report tabs)
      const { data: existingPerms } = await supabase.from('permissions').select('permission_key');
      const existingKeys = new Set((existingPerms || []).map((p) => p.permission_key));
      const toInsertPerms = getAllPlatformPermissions().filter((p) => !existingKeys.has(p.permission_key));
      if (toInsertPerms.length > 0) {
        const { error } = await supabase.from('permissions').insert(toInsertPerms);
        if (error) throw error;
        permCount = toInsertPerms.length;
      }

      // 2. Sync report tabs for each agency and platform (merge new tabs, keep custom ones)
      for (const [platform, platformTabs] of Object.entries(PLATFORM_REPORT_TABS)) {
        if (!platformTabs?.length) continue;
        const { data: agencies } = await supabase.from('agencies').select('id');
        for (const agency of agencies || []) {
          const { data: existingTabs } = await supabase
            .from('agency_report_tabs')
            .select('tab_key, tab_order')
            .eq('agency_id', agency.id)
            .eq('platform', platform);
          const existingTabKeys = new Set((existingTabs || []).map((t) => t.tab_key));
          const maxOrder = (existingTabs || []).reduce((m, t) => Math.max(m, t.tab_order || 0), 0);
          const toInsert = platformTabs
            .filter((t) => !existingTabKeys.has(t.tab_key))
            .map((t, i) => ({
              agency_id: agency.id,
              tab_key: t.tab_key,
              tab_label: t.tab_label || t.tab_key,
              tab_order: maxOrder + i + 1,
              is_visible: true,
              required_permission: `tab.${platform}.${t.tab_key}`,
              platform,
            }));
          if (toInsert.length > 0) {
            const { error } = await supabase.from('agency_report_tabs').insert(toInsert);
            if (error) throw error;
            tabCount += toInsert.length;
          }
        }
      }

      const parts = [];
      if (permCount > 0) parts.push(`${permCount} permission(s)`);
      if (tabCount > 0) parts.push(`${tabCount} report tab(s)`);
      onMessage(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Platform config already up to date');
      loadPermissions();
    } catch (err) {
      onMessage(err?.message || 'Failed to sync', true);
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
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={() => { setFormData({}); setAddModal(true); }}>Add New Permission</button>
        <button type="button" className="btn btn-primary" onClick={syncPlatformConfig} disabled={seeding}>
          {seeding ? 'Syncing…' : 'Sync Platform Config'}
        </button>
        <button type="button" className="btn btn-outline" onClick={seedDefaultPermissions} disabled={seeding}>
          {seeding ? 'Seeding…' : 'Seed Default Permissions'}
        </button>
        <button type="button" className="btn btn-outline" onClick={syncFromReportTabs} disabled={seeding}>
          {seeding ? 'Syncing…' : 'Sync from Report Tabs'}
        </button>
        <button type="button" className="btn btn-outline" onClick={removeLegacyPermissions} disabled={seeding} title="Remove old tab.daily_breakdown, tab.geo, etc.">
          {seeding ? '…' : 'Remove Legacy Permissions'}
        </button>
      </div>
      <p className="help-text" style={{ marginBottom: 12 }}>
        <strong>Recommended:</strong> When you add new features to the platform, update <code>src/config/platformConfig.js</code>, then click <strong>Sync Platform Config</strong> to add missing permissions and report tabs for all agencies.
      </p>
      <div className="admin-permissions-list">
        {[...CATEGORIES, ...Object.keys(byCategory).filter((c) => !CATEGORIES.includes(c))].map((cat) => (
          <div key={cat} className="admin-perm-group">
            <div className="admin-perm-group-label">{getCategoryDisplayLabel(cat)}</div>
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
