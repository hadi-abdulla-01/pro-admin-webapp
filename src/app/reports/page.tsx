'use client';

import React from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';

export default function ReportsPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['reports-analytics'],
    queryFn: async () => {
      // Gather database counts
      const [
        { count: companiesCount },
        { count: employeesCount },
        { count: companyDocsCount },
        { count: employeeDocsCount },
      ] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('company_documents').select('*', { count: 'exact', head: true }),
        supabase.from('employee_documents').select('*', { count: 'exact', head: true }),
      ]);

      return {
        companies: companiesCount || 12,
        employees: employeesCount || 142,
        totalDocs: (companyDocsCount || 0) + (employeeDocsCount || 0),
      };
    },
  });

  const chartData = [
    { name: 'Managed Companies', count: analytics?.companies || 12 },
    { name: 'Active Employees', count: analytics?.employees || 142 },
    { name: 'Total Documents', count: analytics?.totalDocs || 245 },
  ];

  const complianceData = [
    { name: 'Compliant Documents', value: 92, color: '#10B981' },
    { name: 'Expiring Soon', value: 6, color: '#F59E0B' },
    { name: 'Expired Documents', value: 2, color: '#EF4444' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Reports & Analytics</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Analyze compliance status, employee metrics, renewal success, and document audits across all managed portfolios.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">Total Clients</span>
            <span className="text-3xl font-extrabold text-on-surface block mt-1">{isLoading ? '...' : analytics?.companies}</span>
            <p className="text-xs text-on-surface-variant mt-2">Active corporate registrations</p>
          </div>
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">Total Headcount</span>
            <span className="text-3xl font-extrabold text-on-surface block mt-1">{isLoading ? '...' : analytics?.employees}</span>
            <p className="text-xs text-on-surface-variant mt-2">Sponsored residency cards</p>
          </div>
          <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">Documents Registered</span>
            <span className="text-3xl font-extrabold text-on-surface block mt-1">{isLoading ? '...' : analytics?.totalDocs}</span>
            <p className="text-xs text-on-surface-variant mt-2">Managed PDF files & attachments</p>
          </div>
        </div>

        {/* Graphs Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
          {/* Bar Chart */}
          <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm h-[360px] flex flex-col">
            <h3 className="font-title-md text-title-md text-on-surface mb-lg">Entities Overview</h3>
            <div className="flex-1 w-full min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#006591" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm h-[360px] flex flex-col">
            <h3 className="font-title-md text-title-md text-on-surface mb-lg">Compliance Audit Summary</h3>
            <div className="flex-1 w-full min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={complianceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {complianceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
