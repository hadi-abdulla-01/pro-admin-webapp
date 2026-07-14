'use client';

import React from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function SupportPortalPage() {
  const queryClient = useQueryClient();

  // Fetch support requests
  const { data: tickets, isLoading } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_requests')
        .select('*, companies(name), users(name, email)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Update support status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'open' | 'in_progress' | 'resolved' }) => {
      const { error } = await supabase
        .from('support_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });

  // Update ticket priority
  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: 'low' | 'medium' | 'high' }) => {
      const { error } = await supabase
        .from('support_requests')
        .update({ priority })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Support Requests</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Review, track, and resolve client inquiries regarding trade licenses, visa approvals, and portal usage.</p>
        </div>

        {/* Tickets Board */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="p-lg border-b border-border-subtle bg-bg-subtle">
            <h3 className="font-title-md text-title-md text-on-surface">Client Support Tickets</h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {isLoading ? (
              <div className="p-xl text-center text-on-surface-variant">Loading support tickets...</div>
            ) : (tickets || []).length === 0 ? (
              <div className="p-xl text-center text-on-surface-variant">No support requests. All clear!</div>
            ) : (
              tickets?.map((t) => (
                <div key={t.id} className="p-lg flex flex-col md:flex-row md:items-start justify-between gap-lg hover:bg-surface-container-lowest transition-colors">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        t.priority === 'high'
                          ? 'bg-danger/10 text-danger'
                          : t.priority === 'medium'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-primary/10 text-primary'
                      }`}>
                        {t.priority} priority
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        Submitted: {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-title-md font-bold text-on-surface">{t.subject}</h3>
                    <p className="text-body-sm text-on-surface-variant font-medium whitespace-pre-wrap">{t.message}</p>

                    <div className="flex flex-wrap items-center gap-sm pt-2 text-xs">
                      <span className="font-semibold text-primary">{t.companies?.name || 'N/A'}</span>
                      <span className="text-on-surface-variant">â€¢</span>
                      <span className="text-on-surface-variant font-medium">Submitted by: {t.users?.name || 'Client'} ({t.users?.email || 'N/A'})</span>
                    </div>
                  </div>

                  {/* Actions & Status Control */}
                  <div className="flex flex-col gap-sm justify-start md:items-end min-w-[200px]">
                    <div className="flex items-center gap-sm">
                      <span className="text-xs font-semibold text-on-surface-variant">Status:</span>
                      <select
                        value={t.status}
                        onChange={(e: any) => updateStatusMutation.mutate({ id: t.id, status: e.target.value })}
                        className="bg-white border border-border-subtle rounded-lg text-xs px-2 py-1 focus:ring-primary font-bold capitalize"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-sm">
                      <span className="text-xs font-semibold text-on-surface-variant">Priority:</span>
                      <select
                        value={t.priority}
                        onChange={(e: any) => updatePriorityMutation.mutate({ id: t.id, priority: e.target.value })}
                        className="bg-white border border-border-subtle rounded-lg text-xs px-2 py-1 focus:ring-primary font-bold capitalize"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
