'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';

const notifySchema = zod.object({
  company_id: zod.string().or(zod.string().length(0)).optional(),
  title: zod.string().min(2, { message: 'Title is required' }),
  message: zod.string().min(4, { message: 'Message must be at least 4 characters' }),
  type: zod.enum(['alert', 'expiry', 'info']),
});

type NotifyFields = zod.infer<typeof notifySchema>;

export default function NotificationsConfigPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NotifyFields>({
    resolver: zodResolver(notifySchema),
    defaultValues: {
      type: 'info',
    },
  });

  // Fetch Companies
  const { data: companies } = useQuery({
    queryKey: ['notify-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['all-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, companies(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Add Notification
  const addNotifyMutation = useMutation({
    mutationFn: async (fields: NotifyFields) => {
      // 1. Insert into Supabase
      const { data: inserted, error } = await supabase
        .from('notifications')
        .insert([
          {
            company_id: fields.company_id || null,
            title: fields.title,
            message: fields.message,
            type: fields.type,
            is_read: false,
          },
        ])
        .select('id');
      if (error) throw error;

      const notificationId = inserted?.[0]?.id;

      // 2. Send FCM push (fire-and-forget — non-blocking)
      if (notificationId) {
        try {
          const response = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notification_id: notificationId,
              company_id: fields.company_id || null,
              title: fields.title,
              message: fields.message,
            }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error('Push send error:', errorData);
          }
        } catch (e) {
          console.error('Push send error:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
      setIsModalOpen(false);
      reset();
    },
  });


  // Delete Notification
  const deleteNotifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
    },
  });

  const onSubmit = (data: NotifyFields) => {
    addNotifyMutation.mutate(data);
  };

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Notification Center</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Post system alerts, warnings, broadcast notices, and direct client communications.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-md py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_alert</span>
            <span>Send Alert</span>
          </button>
        </div>

        {/* List of Sent Notifications */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="p-lg border-b border-border-subtle bg-bg-subtle">
            <h3 className="font-title-md text-title-md text-on-surface">Sent Logs</h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {isLoading ? (
              <div className="p-xl text-center text-on-surface-variant">Loading notifications...</div>
            ) : (notifications || []).length === 0 ? (
              <div className="p-xl text-center text-on-surface-variant">No alerts posted yet.</div>
            ) : (
              notifications?.map((notif) => (
                <div key={notif.id} className="p-lg flex items-start gap-md hover:bg-surface-container-lowest transition-colors group">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    notif.type === 'alert'
                      ? 'bg-danger/10 text-danger'
                      : notif.type === 'expiry'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    <span className="material-symbols-outlined">
                      {notif.type === 'alert' ? 'emergency' : notif.type === 'expiry' ? 'warning' : 'info'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-title-md text-on-surface font-bold">{notif.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-on-surface-variant">
                          {new Date(notif.created_at).toLocaleDateString()} {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${notif.title}"? This cannot be undone.`)) {
                              deleteNotifyMutation.mutate(notif.id);
                            }
                          }}
                          disabled={deleteNotifyMutation.isPending}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-danger/10 text-on-surface-variant hover:text-danger"
                          title="Delete notification"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{notif.message}</p>
                    <div className="mt-3 flex gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        notif.companies ? 'bg-primary/10 text-primary' : 'bg-secondary/15 text-secondary'
                      }`}>
                        {notif.companies ? `Direct: ${notif.companies.name}` : 'Broadcast (Global)'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-high text-on-surface-variant uppercase">
                        {notif.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Alert Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">Post Notification</h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  reset();
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Recipient (Target)</label>
                <select
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  {...register('company_id')}
                >
                  <option value="">Broadcast to All Client Companies</option>
                  {companies?.map((c) => (
                    <option key={c.id} value={c.id}>
                      Direct to: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Notification Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Visa Status Update"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                    {...register('title')}
                  />
                  {errors.title && <p className="mt-1 text-danger text-[10px] font-semibold">{errors.title.message}</p>}
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Alert Type</label>
                  <select
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                    {...register('type')}
                  >
                    <option value="info">Info Announcement</option>
                    <option value="expiry">Expiry Warning</option>
                    <option value="alert">Critical Alert</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Message</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter details of notification..."
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  {...register('message')}
                />
                {errors.message && <p className="mt-1 text-danger text-[10px] font-semibold">{errors.message.message}</p>}
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    reset();
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addNotifyMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/55 transition-all"
                >
                  {addNotifyMutation.isPending ? 'Sending...' : 'Dispatch Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
