'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function UsersRolesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Creation State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('client');
  const [newClientType, setNewClientType] = useState<'company' | 'group'>('company');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editClientType, setEditClientType] = useState<'company' | 'group'>('company');
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch Users
  const { data: users, isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*, roles(name), companies(name), company_groups:group_id(name)')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Companies
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name, entity_type').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Groups
  const { data: groups } = useQuery({
    queryKey: ['groups-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_groups').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Toggle user block status mutation.
  // Writes both `status` (admin webapp display) and `is_blocked` (Flutter
  // mobile app reads) so both sides stay in sync from a single action.
  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const blocking = currentStatus === 'active';
      const { error } = await supabase
        .from('users')
        .update({ status: blocking ? 'blocked' : 'active', is_blocked: blocking })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_auth_user', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });

  const validatePassword = (password: string) => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
    return '';
  };

  // Create User Action
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) return;
    
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      alert(passwordError);
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_email: newEmail,
          p_password: newPassword,
          p_name: newName,
          p_role: newRole,
          p_company_id: newRole === 'client' && newClientType === 'company' && newCompanyId ? newCompanyId : null,
          p_group_id: newRole === 'client' && newClientType === 'group' && newGroupId ? newGroupId : null,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create user');

      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setIsAddModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('client');
      setNewCompanyId('');
      setNewGroupId('');
      setNewClientType('company');
    } catch (err: any) {
      console.error(err);
      alert('Error creating user: ' + (err.message || err));
    } finally {
      setIsCreating(false);
    }
  };

  // Update User Action
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    try {
      const { data: roleData } = await supabase
        .from('roles')
        .select('id')
        .eq('name', editRole)
        .single();
        
      if (!roleData) throw new Error('Role not found');

      const { error } = await supabase
        .from('users')
        .update({
          role_id: roleData.id,
          company_id: editRole === 'client' && editClientType === 'company' && editCompanyId ? editCompanyId : null,
          group_id: editRole === 'client' && editClientType === 'group' && editGroupId ? editGroupId : null,
        })
        .eq('id', editingUser.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setEditingUser(null);
    } catch (err: any) {
      console.error(err);
      alert('Error updating user: ' + (err.message || err));
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter Logic
  const filteredUsers = (users || []).filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.companies?.name && user.companies.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesSearch;
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Users & Roles</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Administer user accounts, block compromised profiles, assign corporate relationships, and audit login access.</p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-lg py-2.5 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary/95 transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Add User</span>
          </button>
        </div>

        {/* Filters Controls */}
        <div className="flex flex-col md:flex-row gap-md justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary text-body-sm bg-white"
              placeholder="Search by name, email, or company..."
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">User Name</th>
                  <th className="p-lg">Email Address</th>
                  <th className="p-lg">Role</th>
                  <th className="p-lg">Associated Company</th>
                  <th className="p-lg text-center">Status</th>
                  <th className="p-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-xl text-center">
                      <div className="flex justify-center items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                        <span>Loading user base...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-xl text-center text-on-surface-variant">
                      No user accounts registered.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-lg font-bold">{user.name}</td>
                      <td className="p-lg font-mono text-on-surface-variant text-xs">{user.email}</td>
                      <td className="p-lg">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          user.roles?.name === 'admin' ? 'bg-primary-container/10 text-primary' : 'bg-secondary/15 text-secondary'
                        }`}>
                          {user.roles?.name || 'Client'}
                        </span>
                      </td>
                      <td className="p-lg font-semibold text-on-surface-variant">
                        {user.companies?.name ? (
                          <span>{user.companies.name}</span>
                        ) : user.company_groups?.name ? (
                          <span className="inline-flex items-center gap-1 text-primary font-bold">
                            <span className="material-symbols-outlined text-[14px]">corporate_fare</span>
                            <span>{user.company_groups.name}</span>
                          </span>
                        ) : (
                          <span className="italic text-xs font-normal text-on-surface-variant">Internal Staff (Amanah)</span>
                        )}
                      </td>
                      <td className="p-lg text-center">
                        <span
                          onClick={() => toggleUserStatusMutation.mutate({ id: user.id, currentStatus: user.status })}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                            user.status === 'active'
                              ? 'bg-success/10 text-success hover:bg-success/20'
                              : 'bg-danger/10 text-danger hover:bg-danger/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                          {user.status === 'active' ? 'Active' : 'Blocked'}
                        </span>
                      </td>
                      <td className="p-lg text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setEditRole(user.roles?.name || 'client');
                            setEditClientType(user.group_id ? 'group' : 'company');
                            setEditCompanyId(user.company_id || '');
                            setEditGroupId(user.group_id || '');
                          }}
                          className="px-2.5 py-1.5 border border-border-subtle rounded-lg text-xs font-semibold hover:bg-surface-container-low transition-colors cursor-pointer text-primary"
                        >
                          Manage
                        </button>
                        <button
                          onClick={() => toggleUserStatusMutation.mutate({ id: user.id, currentStatus: user.status })}
                          className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            user.status === 'active'
                              ? 'border-warning/30 text-warning hover:bg-warning/5'
                              : 'border-success/20 text-success hover:bg-success/5'
                          }`}
                        >
                          {user.status === 'active' ? 'Block' : 'Unblock'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete user account "${user.name}"?`)) {
                              deleteUserMutation.mutate(user.id);
                            }
                          }}
                          className="px-2.5 py-1.5 border border-danger/20 text-danger rounded-lg text-xs font-semibold hover:bg-danger/5 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-title-lg font-bold text-on-surface">Add User Account</h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded-full hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="8+ chars with uppercase, lowercase, number, special char"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Must be 8+ characters with uppercase, lowercase, number, and special character</p>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">System Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  >
                    <option value="client">Client (Representative)</option>
                    <option value="admin">Admin (Staff)</option>
                  </select>
                </div>

                {newRole === 'client' && (
                  <>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1">Client Account Type</label>
                      <select
                        value={newClientType}
                        onChange={(e) => setNewClientType(e.target.value as 'company' | 'group')}
                        className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                      >
                        <option value="company">Standalone Company</option>
                        <option value="group">Group of Companies</option>
                      </select>
                    </div>

                    {newClientType === 'company' ? (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1">Associated Company</label>
                        <select
                          value={newCompanyId}
                          onChange={(e) => setNewCompanyId(e.target.value)}
                          className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                        >
                          <option value="">None (Individual / Unassigned)</option>
                          {companies?.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name} ({company.entity_type === 'individual' ? 'Family' : 'Corporate'})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1">Associated Company Group</label>
                        <select
                          value={newGroupId}
                          onChange={(e) => setNewGroupId(e.target.value)}
                          className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                        >
                          <option value="">Select Company Group</option>
                          {groups?.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all"
                  >
                    {isCreating ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage User Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-title-lg font-bold text-on-surface">Manage User Account</h3>
                  <p className="text-xs text-on-surface-variant">Profile: {editingUser.name} ({editingUser.email})</p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="p-1 rounded-full hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">System Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  >
                    <option value="client">Client (Representative)</option>
                    <option value="admin">Admin (Staff)</option>
                  </select>
                </div>

                {editRole === 'client' && (
                  <>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1">Client Account Type</label>
                      <select
                        value={editClientType}
                        onChange={(e) => setEditClientType(e.target.value as 'company' | 'group')}
                        className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                      >
                        <option value="company">Standalone Company</option>
                        <option value="group">Group of Companies</option>
                      </select>
                    </div>

                    {editClientType === 'company' ? (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1">Associated Company</label>
                        <select
                          value={editCompanyId}
                          onChange={(e) => setEditCompanyId(e.target.value)}
                          className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                        >
                          <option value="">None (Individual / Unassigned)</option>
                          {companies?.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name} ({company.entity_type === 'individual' ? 'Family' : 'Corporate'})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1">Associated Company Group</label>
                        <select
                          value={editGroupId}
                          onChange={(e) => setEditGroupId(e.target.value)}
                          className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                        >
                          <option value="">Select Company Group</option>
                          {groups?.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all"
                  >
                    {isUpdating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
