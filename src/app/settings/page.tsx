'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [newProName, setNewProName] = useState('');
  
  const [sysName, setSysName] = useState('UAE PRO Services Portal');
  const [alertEmail, setAlertEmail] = useState('alerts@proportal.ae');
  const [gracePeriod, setGracePeriod] = useState(30);
  const [whatsappNum, setWhatsappNum] = useState('+971 50 000 0000');
  const [phoneNum, setPhoneNum] = useState('+971 4 000 0000');
  const [adminCompanyName, setAdminCompanyName] = useState('PRO Services');
  const [adminCompanyLogoUrl, setAdminCompanyLogoUrl] = useState('');
  const [adminCompanyLogoFile, setAdminCompanyLogoFile] = useState<File | null>(null);

  // Fetch PROs
  const { data: pros, isLoading: isProsLoading } = useQuery({
    queryKey: ['all-pros'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pros')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch App Settings
  const { data: settingsData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error && error.code !== 'PGRST205') throw error; // Ignore if table doesn't exist yet
      return data || [];
    },
  });

  // Sync settings data to local state when fetched
  useEffect(() => {
    if (settingsData && settingsData.length > 0) {
      settingsData.forEach(setting => {
        if (setting.key === 'support_whatsapp') setWhatsappNum(setting.value);
        if (setting.key === 'support_phone') setPhoneNum(setting.value);
        if (setting.key === 'system_name') setSysName(setting.value);
        if (setting.key === 'alert_email') setAlertEmail(setting.value);
        if (setting.key === 'grace_period') setGracePeriod(parseInt(setting.value) || 30);
        if (setting.key === 'admin_company_name') setAdminCompanyName(setting.value);
        if (setting.key === 'admin_company_logo_url') setAdminCompanyLogoUrl(setting.value);
      });
    }
  }, [settingsData]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      let finalLogoUrl = adminCompanyLogoUrl;
      if (adminCompanyLogoFile) {
        const fileExt = adminCompanyLogoFile.name.split('.').pop();
        const fileName = `admin_logos/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(fileName, adminCompanyLogoFile, {
            cacheControl: '3600',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        
        finalLogoUrl = supabase.storage
          .from('public-assets')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const settings = [
        { key: 'support_whatsapp', value: whatsappNum },
        { key: 'support_phone', value: phoneNum },
        { key: 'system_name', value: sysName },
        { key: 'alert_email', value: alertEmail },
        { key: 'grace_period', value: gracePeriod.toString() },
        { key: 'admin_company_name', value: adminCompanyName },
        { key: 'admin_company_logo_url', value: finalLogoUrl }
      ];
      const { error } = await supabase.from('app_settings').upsert(settings);
      if (error) throw error;
    },
    onSuccess: () => {
      alert('Settings saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (err) => {
      alert('Failed to save settings. Make sure the database migration was applied. Error: ' + err.message);
    }
  });

  // Add PRO Mutation
  const addProMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('pros')
        .insert([{ name }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-pros'] });
      setNewProName('');
    },
  });

  // Remove PRO Mutation
  const removeProMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pros')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-pros'] });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Portal Settings</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Configure portal operations, alert parameters, email integrations, and system-wide default options.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg items-start">
          {/* Configurations Form */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm space-y-6">
            <h3 className="text-title-lg font-bold border-b border-border-subtle pb-3">General Settings</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Portal System Name</label>
                  <input
                    type="text"
                    value={sysName}
                    onChange={(e) => setSysName(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">System Alert Email</label>
                  <input
                    type="email"
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Notifications Grace Period (Days)</label>
                  <input
                    type="number"
                    value={gracePeriod}
                    onChange={(e) => setGracePeriod(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Support WhatsApp Number</label>
                  <input
                    type="text"
                    value={whatsappNum}
                    onChange={(e) => setWhatsappNum(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Support Phone Number</label>
                  <input
                    type="text"
                    value={phoneNum}
                    onChange={(e) => setPhoneNum(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm mt-4 pt-4 border-t border-border-subtle">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Admin PRO Company Name</label>
                  <input
                    type="text"
                    value={adminCompanyName}
                    onChange={(e) => setAdminCompanyName(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Admin PRO Company Logo</label>
                  <div className="flex flex-wrap items-center gap-4 w-full">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {adminCompanyLogoUrl && !adminCompanyLogoFile && (
                        <img src={adminCompanyLogoUrl} alt="Current Logo" className="h-10 w-10 object-contain rounded border border-border-subtle bg-white flex-shrink-0" />
                      )}
                      {adminCompanyLogoFile && (
                        <div className="h-10 w-10 rounded border border-border-subtle bg-bg-subtle flex items-center justify-center text-xs text-on-surface-variant overflow-hidden flex-shrink-0">
                          New
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAdminCompanyLogoFile(e.target.files[0]);
                          }
                        }}
                        className="flex-1 px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 min-w-0"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">Upload a new logo to replace the current one.</p>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:brightness-110 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saveSettingsMutation.isPending ? 'Saving...' : 'Save Configurations'}
                </button>
              </div>
            </div>
          </div>

          {/* Manage PROs Card */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm space-y-6">
            <h3 className="text-title-lg font-bold border-b border-border-subtle pb-3">Manage Assigned PROs</h3>
            
            <div className="space-y-4">
              {/* Add PRO Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newProName.trim()) return;
                  addProMutation.mutate(newProName.trim());
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Enter PRO Name (e.g. Sarah Jenkins)"
                  value={newProName}
                  onChange={(e) => setNewProName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addProMutation.isPending}
                  className="px-md py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Add PRO</span>
                </button>
              </form>

              {/* PROs List */}
              <div className="border border-border-subtle rounded-xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                {isProsLoading ? (
                  <p className="p-4 text-center text-sm text-on-surface-variant animate-pulse">Loading PROs...</p>
                ) : pros && pros.length > 0 ? (
                  <ul className="divide-y divide-border-subtle">
                    {pros.map((pro: any) => (
                      <li key={pro.id} className="flex justify-between items-center p-md hover:bg-surface-container-low transition-colors">
                        <div className="flex items-center gap-sm">
                          <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-xs">
                            {pro.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-on-surface">{pro.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Are you sure you want to remove ${pro.name}?`)) {
                              removeProMutation.mutate(pro.id);
                            }
                          }}
                          className="p-1 rounded-full text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                          title="Remove PRO"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-md text-center text-sm text-on-surface-variant">No PROs configured in the system.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
