'use client';

import React from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';

export default function DashboardPage() {
  // Fetch stats from Supabase
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [
        { count: totalCompanies },
        { count: totalEmployees },
        { count: expiringDocsCompany },
        { count: expiringDocsEmployee },
        { count: expiredDocsCompany },
        { count: expiredDocsEmployee },
        { count: activeRenewals },
        { data: allRenewals },
        { data: expiringCompDocs },
        { data: expiringEmpDocs },
        { count: totalCompDocs },
        { count: totalEmpDocs }
      ] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('company_documents').select('*', { count: 'exact', head: true }).gte('expiry_date', today).lte('expiry_date', thirtyDaysFromNow),
        supabase.from('employee_documents').select('*', { count: 'exact', head: true }).gte('expiry_date', today).lte('expiry_date', thirtyDaysFromNow),
        supabase.from('company_documents').select('*', { count: 'exact', head: true }).lt('expiry_date', today),
        supabase.from('employee_documents').select('*', { count: 'exact', head: true }).lt('expiry_date', today),
        supabase.from('renewal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('renewal_requests').select('created_at'),
        supabase.from('company_documents').select('expiry_date, document_categories(name)').gte('expiry_date', today).lte('expiry_date', thirtyDaysFromNow),
        supabase.from('employee_documents').select('expiry_date, document_categories(name)').gte('expiry_date', today).lte('expiry_date', thirtyDaysFromNow),
        supabase.from('company_documents').select('*', { count: 'exact', head: true }),
        supabase.from('employee_documents').select('*', { count: 'exact', head: true }),
      ]);

      const expiringCount = (expiringDocsCompany || 0) + (expiringDocsEmployee || 0);
      const expiredCount = (expiredDocsCompany || 0) + (expiredDocsEmployee || 0);

      // 1. Generate line chart trend data (last 6 months)
      const last6Months = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return {
          monthIndex: d.getMonth(),
          name: d.toLocaleDateString('en-US', { month: 'short' }),
          value: 0,
        };
      }).reverse();

      if (allRenewals) {
        allRenewals.forEach((r) => {
          const date = new Date(r.created_at);
          const month = date.getMonth();
          const monthItem = last6Months.find((m) => m.monthIndex === month);
          if (monthItem) monthItem.value += 1;
        });
      }

      // 2. Generate expiries by category bar chart data
      const categoryCounts: { [name: string]: number } = {};
      const allUpcomingDocs = [...(expiringCompDocs || []), ...(expiringEmpDocs || [])];
      allUpcomingDocs.forEach((doc: any) => {
        const catName = doc.document_categories?.name || 'Other';
        categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      });

      const categoriesData = Object.entries(categoryCounts).map(([name, value]) => ({
        name,
        value,
        max: Math.max(value * 2, 10), // scale bounds
      }));

      // Default visual categories to show if there are 0 expiries
      if (categoriesData.length === 0) {
        categoriesData.push(
          { name: 'Trade Licenses', value: 0, max: 10 },
          { name: 'Resident Visas', value: 0, max: 10 },
          { name: 'Establishment Cards', value: 0, max: 10 }
        );
      }

      // 3. Calculate dynamic compliance rate
      const totalDocs = (totalCompDocs || 0) + (totalEmpDocs || 0);
      const activeDocs = totalDocs - expiredCount;
      const complianceRate = totalDocs > 0 ? Math.round((activeDocs / totalDocs) * 100) : 100;

      return {
        totalCompanies: totalCompanies || 0,
        totalEmployees: totalEmployees || 0,
        expiringCount: expiringCount || 0,
        expiredCount: expiredCount || 0,
        activeRenewals: activeRenewals || 0,
        trendData: last6Months,
        categoriesData,
        complianceRate,
      };
    },
  });

  // Fetch recent activity
  const { data: activities } = useQuery({
    queryKey: ['admin-activities'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*, users(name)')
        .order('created_at', { ascending: false })
        .limit(3);
      
      return data || [];
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Admin Dashboard</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Overview of corporate services and compliance for all UAE entities.</p>
          </div>
          <div>
            <button className="bg-white border border-outline-variant px-md py-2 rounded-lg font-label-md text-label-md text-on-surface flex items-center gap-2 hover:bg-surface-container-low transition-all">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              <span>Last 30 Days</span>
            </button>
          </div>
        </div>

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-md">
          {/* Card 1 */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-primary-container/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">business</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-on-surface block">
                {statsLoading ? '...' : stats?.totalCompanies.toLocaleString()}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">Total Companies</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-surface-container-highest rounded-lg text-on-surface-variant">
                <span className="material-symbols-outlined">badge</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-on-surface block">
                {statsLoading ? '...' : stats?.totalEmployees.toLocaleString()}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">Total Employees</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-all border-l-4 border-l-warning">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-warning/10 rounded-lg text-warning">
                <span className="material-symbols-outlined">report_problem</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-on-surface block">
                {statsLoading ? '...' : stats?.expiringCount}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">Expiring &lt; 30d</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-all border-l-4 border-l-danger">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-danger/10 rounded-lg text-danger">
                <span className="material-symbols-outlined">priority_high</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-on-surface block">
                {statsLoading ? '...' : stats?.expiredCount}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">Expired Docs</span>
            </div>
          </div>

          {/* Card 5 */}
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-success/10 rounded-lg text-success">
                <span className="material-symbols-outlined">autorenew</span>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-on-surface block">
                {statsLoading ? '...' : stats?.activeRenewals}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant">Renewals Active</span>
            </div>
          </div>
        </div>

        {/* Charts and Main Grid */}
        <div className="grid grid-cols-12 gap-lg">
          {/* Compliance and Quick Actions (Left 3/12) */}
          <div className="col-span-12 lg:col-span-3 space-y-lg">
            {/* Compliance Donut */}
            <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm text-center">
              <h3 className="font-title-md text-title-md text-on-surface mb-lg">Compliance Overview</h3>
              <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="80" cy="80" fill="transparent" r="70" stroke="#F1F5F9" strokeWidth="12"></circle>
                  <circle cx="80" cy="80" fill="transparent" r="70" stroke="#10B981" strokeDasharray="440" strokeDashoffset={440 - (440 * (stats?.complianceRate ?? 100)) / 100} strokeWidth="12" strokeLinecap="round"></circle>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-on-surface">{statsLoading ? '...' : `${stats?.complianceRate}%`}</span>
                  <span className="font-label-sm text-label-sm text-success">Compliant</span>
                </div>
              </div>
              <p className="mt-lg font-body-sm text-body-sm text-on-surface-variant">Across all entities</p>
            </div>

            {/* Quick Actions */}
            <div className="space-y-sm">
              <h3 className="font-title-md text-title-md text-on-surface px-1">Quick Actions</h3>
              <button className="w-full p-lg bg-white border border-border-subtle rounded-2xl flex items-center gap-4 hover:border-primary group transition-all text-left">
                <div className="w-12 h-12 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                  <span className="material-symbols-outlined">add_business</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">Add Company</span>
              </button>
              <button className="w-full p-lg bg-white border border-border-subtle rounded-2xl flex items-center gap-4 hover:border-primary group transition-all text-left">
                <div className="w-12 h-12 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                  <span className="material-symbols-outlined">person_add</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">Add Employee</span>
              </button>
              <button className="w-full p-lg bg-white border border-border-subtle rounded-2xl flex items-center gap-4 hover:border-primary group transition-all text-left">
                <div className="w-12 h-12 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                  <span className="material-symbols-outlined">cloud_upload</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">Upload Document</span>
              </button>
              <button className="w-full p-lg bg-white border border-border-subtle rounded-2xl flex items-center gap-4 hover:border-primary group transition-all text-left">
                <div className="w-12 h-12 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                  <span className="material-symbols-outlined">send</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">Send Reminder</span>
              </button>
            </div>
          </div>

          {/* Main Content (Right 9/12) */}
          <div className="col-span-12 lg:col-span-9 space-y-lg">
            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              {/* Renewal Trends Line Chart */}
              <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col h-[280px]">
                <div className="flex justify-between items-center mb-lg">
                  <h3 className="font-title-md text-title-md text-on-surface">Renewal Trends</h3>
                  <button className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">more_horiz</span>
                  </button>
                </div>
                <div className="flex-1 w-full min-h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats?.trendData || []}>
                      <XAxis dataKey="name" stroke="#6e7881" fontSize={11} tickLine={false} />
                      <YAxis stroke="#6e7881" fontSize={11} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#006591" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Expiries by Category Bar Chart */}
              <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col h-[280px]">
                <div className="flex justify-between items-center mb-lg">
                  <h3 className="font-title-md text-title-md text-on-surface">Upcoming Expiries by Category</h3>
                  <button className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">filter_list</span>
                  </button>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto">
                  {(stats?.categoriesData || []).map((cat) => {
                    const percentage = (cat.value / cat.max) * 100;
                    return (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex justify-between text-label-sm text-on-surface-variant">
                          <span>{cat.name}</span>
                          <span className="font-bold">{cat.value}</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className="h-full bg-primary-container rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent Activity Section */}
            <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
              <div className="px-lg py-md border-b border-border-subtle flex justify-between items-center bg-bg-subtle">
                <h3 className="font-title-md text-title-md text-on-surface">Recent Activity</h3>
                <button className="text-primary font-label-md text-label-md hover:underline">View Audit Log</button>
              </div>
              <div className="divide-y divide-border-subtle">
                {activities && activities.length > 0 ? (
                  activities.map((log: any) => (
                    <div key={log.id} className="p-lg flex items-start gap-md hover:bg-surface-container-lowest transition-colors">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">
                          {log.action.includes('REGISTERED') || log.action.includes('COMPANY') ? 'domain_add' : 'upload_file'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-title-md text-title-md text-on-surface">{log.action.replace(/_/g, ' ')}</h4>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{log.details}</p>
                        <div className="flex gap-sm mt-3">
                          <span className="text-[11px] text-on-surface-variant font-medium">By: {log.users?.name || 'System'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-xl text-center text-on-surface-variant font-medium">
                    No recent activity logs recorded in the database.
                  </div>
                )}
              </div>
              <div className="p-md text-center bg-surface-container-low border-t border-border-subtle">
                <button className="text-on-surface-variant font-label-md text-label-md hover:text-on-surface flex items-center gap-2 mx-auto">
                  <span>View more activities</span>
                  <span className="material-symbols-outlined text-base">expand_more</span>
                </button>
              </div>
            </div>

            {/* Asymmetric Featured Card */}
            <div className="relative bg-inverse-surface text-inverse-on-surface rounded-2xl overflow-hidden shadow-xl flex flex-col md:flex-row items-stretch min-h-[200px]">
              <div className="relative z-10 p-xl flex-1 max-w-lg flex flex-col justify-center">
                <span className="inline-block self-start px-3 py-1 bg-primary text-white rounded-full text-[9px] font-black tracking-widest uppercase mb-4">
                  SYSTEM ANNOUNCEMENT
                </span>
                <h2 className="font-display text-2xl font-bold text-white mb-2">Automated Renewal Notifications are Live</h2>
                <p className="font-body-md text-body-md text-white/80 mb-6">
                  Clients will now receive smart reminders 90, 60, and 30 days before document expiry via Email and SMS.
                </p>
                <button className="self-start px-lg py-3 bg-white text-inverse-surface rounded-xl font-title-md text-title-md hover:bg-primary-fixed transition-all">
                  Configure Alerts
                </button>
              </div>
              <div
                className="hidden md:block w-1/3 relative bg-cover bg-center shrink-0"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDwfIz4Z-jVIJt20DpiT6jO9Ws1_UpKbFp2XRabHf9y3Yx077GCdJGGWT6eHYi9XYNeQ7IubJmneyeHPYIP7zoM_HJjoMp5YRurUtWQ-udSSIVKu8-T5qIg03GoDbe4jJUIHZcJa5ePIOLq_6IYuKS7UcfSyb4pMLSfekiI9M967YNL8-qRn1XkokIQs1swkapixSWAkVt5n6tgxd9TUo1EyxLebnl4ATfRv6DuDsBGF0QmGEkXo_Fdh6KHD8VTDPJahRELubYgdsQU')",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-inverse-surface via-inverse-surface/40 to-transparent"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
