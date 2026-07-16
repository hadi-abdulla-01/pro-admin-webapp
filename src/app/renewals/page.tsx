'use client';

import React from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function RenewalsPage() {
  const queryClient = useQueryClient();

  // Fetch renewals
  const { data: renewals, isLoading } = useQuery({
    queryKey: ['all-renewals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_requests')
        .select('*, companies(name), document_categories(name), employees(first_name, last_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Action mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'in_progress' | 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('renewal_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-renewals'] });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Renewal Requests</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Review, authorize, and process government licensing and visa renewals requested by corporate clients.</p>
        </div>

        {/* Renewals Table */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">Date Requested</th>
                  <th className="p-lg">Company Name</th>
                  <th className="p-lg">Document Type</th>
                  <th className="p-lg">Profile Context</th>
                  <th className="p-lg">Submission Details</th>
                  <th className="p-lg text-center">Status</th>
                  <th className="p-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-xl text-center text-on-surface-variant">
                      <div className="flex justify-center items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                        <span>Loading renewals...</span>
                      </div>
                    </td>
                  </tr>
                ) : (renewals || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-xl text-center text-on-surface-variant">
                      No renewal requests on log.
                    </td>
                  </tr>
                ) : (
                  renewals?.map((req) => (
                    <tr key={req.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-lg text-on-surface-variant">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-lg font-bold text-primary">
                        {req.companies?.name || 'N/A'}
                      </td>
                      <td className="p-lg font-semibold">{req.document_categories?.name || 'Other'}</td>
                      <td className="p-lg">
                        {req.employees ? (
                          <div className="flex flex-col">
                            <span className="font-semibold">{req.employees.first_name} {req.employees.last_name}</span>
                            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Employee Visa</span>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant italic">Company Level</span>
                        )}
                      </td>
                      <td className="p-lg max-w-xs text-on-surface-variant font-medium">
                        {req.details || 'No details provided.'}
                      </td>
                      <td className="p-lg text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                          req.status === 'pending' || req.status === 'requested'
                            ? 'bg-warning/10 text-warning'
                            : req.status === 'in_progress'
                            ? 'bg-primary/10 text-primary'
                            : req.status === 'approved'
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            req.status === 'pending' || req.status === 'requested'
                              ? 'bg-warning'
                              : req.status === 'in_progress'
                              ? 'bg-primary'
                              : req.status === 'approved'
                              ? 'bg-success'
                              : 'bg-danger'
                          }`}></span>
                          {req.status === 'in_progress' ? 'In Progress' : req.status}
                        </span>
                      </td>
                      <td className="p-lg text-right space-x-2">
                        {(req.status === 'requested' || req.status === 'pending') && (
                          <>
                            <button
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'in_progress' })}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-28 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">sync</span>
                              <span>In Progress</span>
                            </button>
                            <button
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'rejected' })}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-24 bg-danger text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                        {req.status === 'in_progress' && (
                          <>
                            <button
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'approved' })}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-28 bg-success text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">check</span>
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'rejected' })}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-24 bg-danger text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
