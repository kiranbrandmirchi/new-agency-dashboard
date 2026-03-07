import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const ADMIN_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'clients', label: 'Clients' },
  { id: 'permissions', label: 'Permissions' },
];

const PLATFORMS = ['google_ads', 'facebook_ads', 'bing_ads', 'tiktok_ads', 'pinterest_ads', 'reddit_ads', 'snapchat_ads', 'linkedin_ads'];
const CATEGORIES = ['sidebar', 'report_tab', 'action', 'customer'];

export function Admin() {
  const { agencyId } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const showMessage = useCallback((msg, isError = false) => {
    setMessage(msg);
    setError(isError);
    setTimeout(() => { setMessage(null); setError(null); }, 4000);
  }, []);

  return (
    <div className="page-section active" id="page-admin">
      <div className="page-content">
        <div className="page-title-bar">
          <h2>Admin Panel</h2>
          <p>Manage users, roles, clients, and permissions</p>
        </div>

        <div className="admin-tabs">
          {ADMIN_TABS.map((t) => (
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

        {activeTab === 'users' && <AdminUsersTab onMessage={showMessage} setLoading={setLoading} agencyId={agencyId} />}
        {activeTab === 'roles' && <AdminRolesTab onMessage={showMessage} setLoading={setLoading} />}
        {activeTab === 'clients' && <AdminClientsTab onMessage={showMessage} setLoading={setLoading} agencyId={agencyId} />}
        {activeTab === 'permissions' && <AdminPermissionsTab onMessage={showMessage} setLoading={setLoading} />}
      </div>
    </div>
  );
}

function AdminUsersTab({ onMessage, setLoading, agencyId }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [userAssignedClients, setUserAssignedClients] = useState({});
  const [search, setSearch] = useState('');
  const [manageClientsUser, setManageClientsUser] = useState(null);
  const [allPlatformAccounts, setAllPlatformAccounts] = useState([]);
  const [userClientAssignments, setUserClientAssignments] = useState({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rolesData, error: rolesErr } = await supabase.from('roles').select('*');
      if (rolesErr) console.warn('[Admin] roles fetch:', rolesErr);
      setRoles(rolesData || []);

      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, is_active, role_id')
        .order('full_name');

      if (error) throw error;
      setUsers(profiles || []);

      const { data: ucData } = await supabase.from('user_clients').select('user_id, client_id');
      const { data: cpaData } = await supabase.from('client_platform_accounts').select('id, account_name, platform_customer_id');
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
  }, [onMessage, setLoading]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadAllPlatformAccounts = useCallback(async () => {
    if (!agencyId) {
      setAllPlatformAccounts([]);
      return;
    }
    const { data } = await supabase
      .from('client_platform_accounts')
      .select('id, account_name, platform_customer_id, platform, is_active')
      .eq('agency_id', agencyId)
      .order('account_name');
    setAllPlatformAccounts(data || []);
  }, [agencyId]);

  const loadUserClients = useCallback(async (userId) => {
    const { data } = await supabase.from('user_clients').select('client_id').eq('user_id', userId);
    setUserClientAssignments((prev) => ({ ...prev, [userId]: new Set((data || []).map((r) => r.client_id)) }));
  }, []);

  const openManageClients = async (user) => {
    setManageClientsUser(user);
    await loadAllPlatformAccounts();
    await loadUserClients(user.id);
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
      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search"
        />
      </div>
      <div className="table-wrapper">
        <table className="data-table gads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Assigned Clients</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
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

function AdminClientsTab({ onMessage, setLoading, agencyId }) {
  const [accounts, setAccounts] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [formData, setFormData] = useState({ platform: 'google_ads', platform_customer_id: '', account_name: '' });

  const loadAccounts = useCallback(async () => {
    if (!agencyId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_platform_accounts')
        .select('*')
        .eq('agency_id', agencyId)
        .order('account_name');
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      onMessage(err.message || 'Failed to load accounts', true);
    } finally {
      setLoading(false);
    }
  }, [agencyId, onMessage, setLoading]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const addAccount = async () => {
    if (!agencyId) {
      onMessage('No agency assigned', true);
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
        .eq('agency_id', agencyId)
        .eq('platform', formData.platform)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      const credentialId = creds?.id ?? null;
      const { error } = await supabase.from('client_platform_accounts').insert({
        agency_id: agencyId,
        credential_id: credentialId,
        platform: formData.platform,
        platform_customer_id: formData.platform_customer_id.trim(),
        account_name: formData.account_name?.trim() || formData.platform_customer_id.trim(),
        is_active: true,
      });
      if (error) throw error;
      onMessage('Account added');
      setAddModal(false);
      setFormData({ platform: 'google_ads', platform_customer_id: '', account_name: '' });
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
        <button type="button" className="btn btn-primary" onClick={() => { setFormData({ platform: 'google_ads', platform_customer_id: '', account_name: '' }); setAddModal(true); }}>
          Add Account
        </button>
      </div>
      {!agencyId ? (
        <p className="admin-empty-hint">No agency assigned. You must have an agency to manage accounts.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table gads-table admin-clients-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Platform</th>
                <th>Customer ID</th>
                <th>Active</th>
                <th>Last Sync</th>
                <th>Sync Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.account_name || '—'}</td>
                  <td><span className="admin-platform-badge">{a.platform}</span></td>
                  <td>{a.platform_customer_id}</td>
                  <td>
                    <label className="admin-toggle">
                      <input type="checkbox" checked={!!a.is_active} onChange={() => toggleActive(a)} />
                      <span />
                    </label>
                  </td>
                  <td>{a.last_sync_at ? new Date(a.last_sync_at).toLocaleString() : '—'}</td>
                  <td>{a.sync_status || '—'}</td>
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
              <div className="auth-form-group">
                <label>Platform *</label>
                <select value={formData.platform || ''} onChange={(e) => setFormData({ ...formData, platform: e.target.value })} required>
                  <option value="">Select platform...</option>
                  {PLATFORMS.map((p) => (
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

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('permissions').select('*').order('category').order('permission_key');
    setPermissions(data || []);
    setLoading(false);
  }, [setLoading]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

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
