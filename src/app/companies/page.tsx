'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import Link from 'next/link';
import { useAuth } from '@/components/providers';

const companySchema = zod.object({
  name: zod.string().min(2, { message: 'Name must be at least 2 characters' }),
  entity_type: zod.enum(['corporate', 'individual']),
  trade_license_number: zod.string().optional(),
  trade_license_issue: zod.string().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Valid issue date is required',
  }).optional(),
  trade_license_expiry: zod.string().optional(),
  logo_url: zod.string().url().or(zod.string().length(0)).optional(),
  email: zod.string().email({ message: 'Invalid email address' }).or(zod.string().length(0)).optional(),
  phone: zod.string().or(zod.string().length(0)).optional(),
  group_id: zod.string().or(zod.string().length(0)).optional(),
}).superRefine((data, ctx) => {
  if (data.entity_type === 'corporate') {
    if (!data.trade_license_number || data.trade_license_number.trim().length < 2) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ['trade_license_number'],
        message: 'Trade license is required for corporate entities',
      });
    }
    if (!data.trade_license_expiry || isNaN(Date.parse(data.trade_license_expiry))) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ['trade_license_expiry'],
        message: 'Valid expiry date is required for corporate entities',
      });
    }
  }
});

type CompanyFormFields = zod.infer<typeof companySchema>;

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CompanyFormFields>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      entity_type: 'corporate',
    },
  });

  const entityType = watch('entity_type');

  // Fetch Companies
  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          employees(id, status),
          renewal_requests(id, status),
          company_groups:group_id(id, name)
        `)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Groups for assignment selector
  const { data: groups } = useQuery({
    queryKey: ['groups-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_groups')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Add Company Mutation
  const addCompanyMutation = useMutation({
    mutationFn: async (newData: CompanyFormFields) => {
      const isCorporate = newData.entity_type === 'corporate';
      const { data, error } = await supabase
        .from('companies')
        .insert([
          {
            name: newData.name,
            entity_type: newData.entity_type,
            trade_license_number: isCorporate ? newData.trade_license_number : null,
            trade_license_issue: (isCorporate && newData.trade_license_issue) ? newData.trade_license_issue : null,
            trade_license_expiry: isCorporate ? newData.trade_license_expiry : null,
            logo_url: newData.logo_url || null,
            status: 'active',
            email: newData.email || null,
            phone: newData.phone || null,
            group_id: newData.group_id || null,
          },
        ])
        .select();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: isCorporate ? 'REGISTERED_NEW_COMPANY' : 'REGISTERED_NEW_FAMILY',
          details: isCorporate 
            ? `Registered a new company: ${newData.name}`
            : `Registered a new individual/family: ${newData.name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsModalOpen(false);
      reset();
    },
  });

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = currentStatus === 'active' ? 'disabled' : 'active';
      const { error } = await supabase
        .from('companies')
        .update({ status: nextStatus })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  // Delete Company Mutation
  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const onSubmit = (data: CompanyFormFields) => {
    addCompanyMutation.mutate(data);
  };

  const [entityFilter, setEntityFilter] = useState<'all' | 'family'>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setEntityFilter(params.get('filter') === 'family' ? 'family' : 'all');
    }
  }, []);

  const filteredCompanies = (companies || []).filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.trade_license_number && company.trade_license_number.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || company.status === statusFilter;
    let matchesEntity = true;
    if (entityFilter === 'family') {
      matchesEntity = company.entity_type === 'individual';
    } else {
      // Default Companies tab should show only corporate entities
      matchesEntity = company.entity_type === 'corporate';
    }

    return matchesSearch && matchesStatus && matchesEntity;
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Company Management</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">View and manage corporate clients, licensing, and compliance profiles.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-md py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Add Company</span>
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
              placeholder="Search by company name or license number..."
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
              <option value="disabled">Disabled Only</option>
            </select>
          </div>
        </div>

        {/* Companies Table Container */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">Name</th>
                  <th className="p-lg">Trade License / ID</th>
                  <th className="p-lg">Expiry Date</th>
                  <th className="p-lg text-center">Active Members</th>
                  <th className="p-lg text-center">Pending Renewals</th>
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
                        <span>Loading entities...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-xl text-center text-on-surface-variant">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((company) => {
                    const activeEmployees = (company.employees || []).filter((e: any) => e.status === 'active').length;
                    const pendingRenewals = (company.renewal_requests || []).filter((r: any) => r.status === 'pending' || r.status === 'requested' || r.status === 'in_progress').length;
                    const isExpired = company.trade_license_expiry && new Date(company.trade_license_expiry) < new Date();
                    const isIndividual = company.entity_type === 'individual';

                    return (
                      <tr key={company.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold font-title-lg ${
                              isIndividual ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'
                            }`}>
                              {company.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-on-surface">{company.name}</span>
                              {company.company_groups ? (
                                <span className="text-[11px] text-primary font-semibold flex items-center gap-0.5 mt-0.5">
                                  <span className="material-symbols-outlined text-[12px]">corporate_fare</span>
                                  <span>{company.company_groups.name}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-on-surface-variant flex items-center gap-0.5 mt-0.5">
                                  <span className="material-symbols-outlined text-[12px]">
                                    {isIndividual ? 'person' : 'apartment'}
                                  </span>
                                  <span>{isIndividual ? 'Family / Individual' : 'Corporate Member'}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-lg font-mono text-on-surface-variant">
                          {company.trade_license_number || 'N/A'}
                        </td>
                        <td className="p-lg">
                          <div className="flex flex-col">
                            <span className={isExpired ? 'text-danger font-bold' : 'text-on-surface'}>
                              {company.trade_license_expiry ? new Date(company.trade_license_expiry).toLocaleDateString() : 'N/A'}
                            </span>
                            {isExpired && (
                              <span className="text-[10px] text-danger font-bold uppercase tracking-wider">EXPIRED</span>
                            )}
                          </div>
                        </td>
                        <td className="p-lg text-center font-bold">{activeEmployees}</td>
                        <td className="p-lg text-center font-bold text-warning">{pendingRenewals}</td>
                        <td className="p-lg text-center">
                          <span
                            onClick={() => toggleStatusMutation.mutate({ id: company.id, currentStatus: company.status })}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                              company.status === 'active'
                                ? 'bg-success/10 text-success hover:bg-success/20'
                                : 'bg-danger/10 text-danger hover:bg-danger/20'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${company.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                            {company.status === 'active' ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="p-lg text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/companies/${company.id}`}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-24 bg-surface border border-border-subtle rounded-lg text-xs font-semibold hover:bg-surface-container-low transition-colors text-primary"
                            >
                              <span>Manage</span>
                              <span className="material-symbols-outlined text-xs">arrow_forward</span>
                            </Link>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete company "${company.name}"? This will delete all its employees and documents.`)) {
                                  deleteCompanyMutation.mutate(company.id);
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 w-24 border border-danger/20 text-danger rounded-lg text-xs font-semibold hover:bg-danger/5 transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Company Modal Dialog */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-title-lg font-bold text-on-surface">Add New Entity</h3>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    reset();
                  }}
                  className="p-1 rounded-full hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Entity Type</label>
                  <select
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    {...register('entity_type')}
                  >
                    <option value="corporate">Corporate Business</option>
                    <option value="individual">Individual / Family</option>
                  </select>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">
                    {entityType === 'corporate' ? 'Company Name' : 'Family / Name'}
                  </label>
                  <input
                    type="text"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                      errors.name ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                    }`}
                    placeholder={entityType === 'corporate' ? 'Enter company name' : 'Enter family or individual name'}
                    {...register('name')}
                  />
                  {errors.name && <p className="mt-1 text-danger text-[11px] font-semibold">{errors.name.message}</p>}
                </div>

                {entityType === 'corporate' && (
                  <>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-2">Trade License Number</label>
                      <input
                        type="text"
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                          errors.trade_license_number ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                        }`}
                        placeholder="e.g. TL-883910"
                        {...register('trade_license_number')}
                      />
                      {errors.trade_license_number && (
                        <p className="mt-1 text-danger text-[11px] font-semibold">{errors.trade_license_number.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-2">Trade License Issue Date</label>
                        <input
                          type="date"
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                            errors.trade_license_issue ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                          }`}
                          {...register('trade_license_issue')}
                        />
                        {errors.trade_license_issue && (
                          <p className="mt-1 text-danger text-[11px] font-semibold">{errors.trade_license_issue.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-2">Trade License Expiry Date</label>
                        <input
                          type="date"
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                            errors.trade_license_expiry ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                          }`}
                          {...register('trade_license_expiry')}
                        />
                        {errors.trade_license_expiry && (
                          <p className="mt-1 text-danger text-[11px] font-semibold">{errors.trade_license_expiry.message}</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Logo URL (Optional)</label>
                  <input
                    type="text"
                    className={`w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary`}
                    placeholder="https://example.com/logo.png"
                    {...register('logo_url')}
                  />
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Entity Group (Optional)</label>
                  <select
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    {...register('group_id')}
                  >
                    <option value="">Standalone Entity (No Group)</option>
                    {groups?.map((group: any) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-2">Contact Email (Optional)</label>
                    <input
                      type="text"
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                        errors.email ? 'border-danger focus:ring-danger' : 'border-border-subtle'
                      }`}
                      placeholder="client@example.com"
                      {...register('email')}
                    />
                    {errors.email && <p className="mt-1 text-danger text-[11px] font-semibold">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-2">Contact Phone (Optional)</label>
                    <input
                      type="text"
                      className={`w-full px-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary`}
                      placeholder="+971 50 123 4567"
                      {...register('phone')}
                    />
                  </div>
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
                    disabled={addCompanyMutation.isPending}
                    className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all"
                  >
                    {addCompanyMutation.isPending ? 'Creating...' : 'Create Entity'}
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
