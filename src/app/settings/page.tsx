'use client';

import React from 'react';
import AdminLayout from '@/components/admin-layout';

export default function SettingsPage() {
  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Portal Settings</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Configure portal operations, alert parameters, email integrations, and system-wide default options.</p>
        </div>

        {/* Configurations Form */}
        <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm max-w-2xl space-y-6">
          <h3 className="text-title-lg font-bold border-b border-border-subtle pb-3">General Settings</h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Portal System Name</label>
                <input
                  type="text"
                  defaultValue="UAE PRO Services Portal"
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">System Alert Email</label>
                <input
                  type="email"
                  defaultValue="alerts@proportal.ae"
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Notifications Grace Period (Days)</label>
                <input
                  type="number"
                  defaultValue={30}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Support WhatsApp Number</label>
                <input
                  type="text"
                  defaultValue="+971 50 000 0000"
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-bg-subtle focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button className="px-lg py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:brightness-110 transition-colors cursor-pointer">
                Save Configurations
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
