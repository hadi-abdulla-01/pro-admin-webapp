'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch Employees
  const { data: employees, isLoading } = useQuery({
    queryKey: ['all-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*, companies(name)')
        .order('first_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Toggle Employee Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('employees')
        .update({ status: nextStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-employees'] });
    },
  });

  // Filter Logic
  const filteredEmployees = (employees || []).filter((emp) => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const designation = (emp.designation || '').toLowerCase();
    const companyName = (emp.companies?.name || '').toLowerCase();

    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
      designation.includes(searchTerm.toLowerCase()) ||
      companyName.includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Employee Directory</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Manage employee profiles, visas, labor cards, and passport details across all entities.</p>
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
              placeholder="Search by employee name, role, or company..."
            />
          </div>

          <div className="flex gap-sm">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-border-subtle rounded-lg px-md py-2 text-body-sm focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Employees Table */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">Employee Name</th>
                  <th className="p-lg">Company</th>
                  <th className="p-lg">Designation</th>
                  <th className="p-lg">Labor Card No</th>
                  <th className="p-lg">Visa Expiry</th>
                  <th className="p-lg">Passport Expiry</th>
                  <th className="p-lg text-center">Status</th>
                  <th className="p-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-xl text-center text-on-surface-variant">
                      <div className="flex justify-center items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                        <span>Loading directory...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-xl text-center text-on-surface-variant">
                      No employees match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isVisaExpired = emp.visa_expiry && new Date(emp.visa_expiry) < new Date();
                    const isPassportExpired = emp.passport_expiry && new Date(emp.passport_expiry) < new Date();

                    return (
                      <tr key={emp.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-lg font-bold">
                          {emp.first_name} {emp.last_name}
                        </td>
                        <td className="p-lg font-medium text-primary">
                          {emp.companies?.name || 'N/A'}
                        </td>
                        <td className="p-lg text-on-surface-variant font-medium">
                          {emp.designation || 'N/A'}
                        </td>
                        <td className="p-lg font-mono text-on-surface-variant text-xs">
                          {emp.labor_card_number || 'N/A'}
                        </td>
                        <td className="p-lg">
                          <span className={isVisaExpired ? 'text-danger font-bold' : ''}>
                            {emp.visa_expiry ? new Date(emp.visa_expiry).toLocaleDateString() : 'N/A'}
                          </span>
                        </td>
                        <td className="p-lg">
                          <span className={isPassportExpired ? 'text-danger font-bold' : ''}>
                            {emp.passport_expiry ? new Date(emp.passport_expiry).toLocaleDateString() : 'N/A'}
                          </span>
                        </td>
                        <td className="p-lg text-center">
                          <span
                            onClick={() => toggleStatusMutation.mutate({ id: emp.id, currentStatus: emp.status })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                              emp.status === 'active'
                                ? 'bg-success/10 text-success hover:bg-success/20'
                                : 'bg-danger/10 text-danger hover:bg-danger/20'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                            {emp.status}
                          </span>
                        </td>
                        <td className="p-lg text-right">
                          <button className="px-3 py-1.5 border border-border-subtle rounded-lg text-xs font-semibold hover:bg-surface-container-low transition-colors">
                            View Profile
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
      </div>
    </AdminLayout>
  );
}
