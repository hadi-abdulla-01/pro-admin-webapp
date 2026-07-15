'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { useAuth } from '@/components/providers';

const groupSchema = zod.object({
  name: zod.string().min(2, { message: 'Group name must be at least 2 characters' }),
});

type GroupFormFields = zod.infer<typeof groupSchema>;

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<any | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GroupFormFields>({
    resolver: zodResolver(groupSchema),
  });

  // Fetch Groups
  const { data: groups, isLoading } = useQuery({
    queryKey: ['company-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_groups')
        .select(`
          *,
          companies(id, name, status)
        `)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });

  // Add Group Mutation
  const addGroupMutation = useMutation({
    mutationFn: async (newData: GroupFormFields) => {
      const { data, error } = await supabase
        .from('company_groups')
        .insert([{ name: newData.name }])
        .select();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'CREATE_COMPANY_GROUP',
          details: `Created a new company group: ${newData.name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-groups'] });
      setIsModalOpen(false);
      reset();
    },
  });

  // Delete Group Mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-groups'] });
      if (selectedGroupDetails?.id) {
        setSelectedGroupDetails(null);
      }
    },
  });

  // Update Group Mutation
  const updateGroupMutation = useMutation({
    mutationFn: async (newData: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('company_groups')
        .update({ name: newData.name })
        .eq('id', newData.id)
        .select();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'UPDATE_COMPANY_GROUP',
          details: `Updated company group name to: ${newData.name}`,
        },
      ]);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['company-groups'] });
      // Update selectedGroupDetails if it's the one being edited
      if (selectedGroupDetails && data && data[0]?.id === selectedGroupDetails.id) {
        setSelectedGroupDetails({ ...selectedGroupDetails, name: data[0].name });
      }
      setIsModalOpen(false);
      setEditingGroupId(null);
      reset();
    },
  });

  const onSubmit = (data: GroupFormFields) => {
    if (editingGroupId) {
      updateGroupMutation.mutate({ id: editingGroupId, name: data.name });
    } else {
      addGroupMutation.mutate(data);
    }
  };

  const filteredGroups = (groups || []).filter((g) =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Company Groups</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Create and manage multi-company groups to enable combined client logins.</p>
          </div>
          <button
            onClick={() => {
              setEditingGroupId(null);
              reset({ name: '' });
              setIsModalOpen(true);
            }}
            className="px-md py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Add Group</span>
          </button>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-col md:flex-row gap-md justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary text-body-sm"
              placeholder="Search by group name..."
            />
          </div>
        </div>

        {/* Groups Table Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                    <th className="p-lg">Group Name</th>
                    <th className="p-lg text-center">Companies Count</th>
                    <th className="p-lg text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                  {isLoading ? (
                    <tr>
                      <td colSpan={3} className="p-xl text-center text-on-surface-variant">
                        <div className="flex justify-center items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                          <span>Loading company groups...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredGroups.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-xl text-center text-on-surface-variant">
                        No groups found. Create a group to get started.
                      </td>
                    </tr>
                  ) : (
                    filteredGroups.map((group) => {
                      const count = (group.companies || []).length;
                      return (
                        <tr
                          key={group.id}
                          onClick={() => setSelectedGroupDetails(group)}
                          className={`hover:bg-surface-container-lowest transition-colors cursor-pointer ${
                            selectedGroupDetails?.id === group.id ? 'bg-surface-container-lowest border-l-4 border-l-primary' : ''
                          }`}
                        >
                          <td className="p-lg font-bold text-on-surface">
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-primary text-[20px]">corporate_fare</span>
                              <span>{group.name}</span>
                            </div>
                          </td>
                          <td className="p-lg text-center font-bold text-on-surface-variant">
                            {count}
                          </td>
                          <td className="p-lg text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedGroupDetails(group)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-xs font-semibold hover:bg-surface-container-low transition-colors text-primary"
                            >
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingGroupId(group.id);
                                reset({ name: group.name });
                                setIsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 border border-border-subtle text-on-surface rounded-lg text-xs font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete group "${group.name}"? This will unassign any associated companies.`)) {
                                  deleteGroupMutation.mutate(group.id);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 border border-danger/20 text-danger rounded-lg text-xs font-semibold hover:bg-danger/5 transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Group Details Sidebar Card */}
          <div className="bg-white rounded-2xl border border-border-subtle shadow-sm p-lg space-y-md">
            <h3 className="font-display text-lg font-extrabold text-on-surface">Group Information</h3>
            {selectedGroupDetails ? (
              <div className="space-y-md">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">Group Name</label>
                  <p className="font-bold text-on-surface text-lg">{selectedGroupDetails.name}</p>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Assigned Companies</label>
                  {(selectedGroupDetails.companies || []).length === 0 ? (
                    <p className="text-body-sm text-on-surface-variant italic">No companies assigned to this group yet.</p>
                  ) : (
                    <ul className="space-y-sm">
                      {selectedGroupDetails.companies.map((co: any) => (
                        <li key={co.id} className="flex items-center justify-between p-sm bg-bg-subtle rounded-lg border border-border-subtle">
                          <span className="font-semibold text-body-sm">{co.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${co.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                            {co.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-xl text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] opacity-40 mb-2">info</span>
                <p className="text-body-sm">Select a company group from the table to view its companies.</p>
              </div>
            )}
          </div>
        </div>

        {/* Add Group Modal Dialog */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-title-lg font-bold text-on-surface">{editingGroupId ? 'Edit Group' : 'Add New Group'}</h3>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingGroupId(null);
                    reset();
                  }}
                  className="p-1 rounded-full hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Group Name</label>
                  <input
                    type="text"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                      errors.name ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                    }`}
                    placeholder="e.g. ABC Group of Companies"
                    {...register('name')}
                  />
                  {errors.name && <p className="mt-1 text-danger text-[11px] font-semibold">{errors.name.message}</p>}
                </div>

                <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingGroupId(null);
                      reset();
                    }}
                    className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addGroupMutation.isPending || updateGroupMutation.isPending}
                    className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all"
                  >
                    {editingGroupId 
                      ? (updateGroupMutation.isPending ? 'Saving...' : 'Save Changes') 
                      : (addGroupMutation.isPending ? 'Creating...' : 'Create Group')}
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
