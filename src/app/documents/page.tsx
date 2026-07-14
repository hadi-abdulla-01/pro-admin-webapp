'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');

  // Fetch Companies for dropdown filters
  const { data: companies } = useQuery({
    queryKey: ['filter-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Document Categories for dropdown filters
  const { data: categories } = useQuery({
    queryKey: ['filter-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_categories').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch All Documents (Union of company_documents and employee_documents)
  const { data: documents, isLoading } = useQuery({
    queryKey: ['all-documents'],
    queryFn: async () => {
      const [companyDocsRes, employeeDocsRes] = await Promise.all([
        supabase.from('company_documents').select('*, companies(name), document_categories(name, id)'),
        supabase.from('employee_documents').select('*, employees(first_name, last_name, companies(name, id)), document_categories(name, id)'),
      ]);

      if (companyDocsRes.error) throw companyDocsRes.error;
      if (employeeDocsRes.error) throw employeeDocsRes.error;

      // Map company documents
      const cDocs = (companyDocsRes.data || []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        category: doc.document_categories?.name || 'Other',
        categoryId: doc.document_categories?.id,
        companyName: doc.companies?.name || 'N/A',
        companyId: doc.company_id,
        ownerType: 'Company Level',
        ownerName: doc.companies?.name || 'N/A',
        size_bytes: doc.size_bytes,
        expiry_date: doc.expiry_date,
        status: doc.status,
        dbTable: 'company_documents',
      }));

      // Map employee documents
      const eDocs = (employeeDocsRes.data || []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        category: doc.document_categories?.name || 'Other',
        categoryId: doc.document_categories?.id,
        companyName: doc.employees?.companies?.name || 'N/A',
        companyId: doc.employees?.companies?.id,
        ownerType: 'Employee Level',
        ownerName: doc.employees ? `${doc.employees.first_name} ${doc.employees.last_name}` : 'N/A',
        size_bytes: doc.size_bytes,
        expiry_date: doc.expiry_date,
        status: doc.status,
        dbTable: 'employee_documents',
      }));

      return [...cDocs, ...eDocs];
    },
  });

  // Delete Document Mutation
  const deleteDocMutation = useMutation({
    mutationFn: async ({ id, dbTable }: { id: string; dbTable: string }) => {
      const { error } = await supabase.from(dbTable).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
    },
  });

  // Filter Logic
  const filteredDocs = (documents || []).filter((doc) => {
    const matchesSearch = doc.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || doc.categoryId === categoryFilter;
    const matchesCompany = companyFilter === 'all' || doc.companyId === companyFilter;

    return matchesSearch && matchesCategory && matchesCompany;
  });

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Page Header */}
        <div>
          <h1 className="font-display text-3xl font-extrabold text-on-surface tracking-tight">Document Repository</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Central document control center for reviewing, downloading, replacing, and tracking license expirations.</p>
        </div>

        {/* Filters Panel */}
        <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm flex flex-col md:flex-row gap-md items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border-subtle rounded-lg focus:ring-2 focus:ring-primary text-body-sm bg-white"
              placeholder="Search file name or owner..."
            />
          </div>

          <div className="flex flex-col md:flex-row gap-sm">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-white border border-border-subtle rounded-lg px-md py-2 text-body-sm focus:ring-primary"
            >
              <option value="all">All Companies</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-border-subtle rounded-lg px-md py-2 text-body-sm focus:ring-primary"
            >
              <option value="all">All Categories</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents Table */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">File Name</th>
                  <th className="p-lg">Company Owner</th>
                  <th className="p-lg">Type</th>
                  <th className="p-lg">Associated Profile</th>
                  <th className="p-lg">Size</th>
                  <th className="p-lg">Expiry Date</th>
                  <th className="p-lg text-center">Status</th>
                  <th className="p-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-xl text-center">
                      <div className="flex justify-center items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                        <span>Loading repositories...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-xl text-center text-on-surface-variant">
                      No files registered matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                    const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                    const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                    return (
                      <tr key={doc.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-lg font-bold text-on-surface flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-base">description</span>
                          <span>{doc.file_name}</span>
                        </td>
                        <td className="p-lg text-primary font-medium">{doc.companyName}</td>
                        <td className="p-lg text-on-surface-variant font-semibold text-xs">{doc.category}</td>
                        <td className="p-lg">
                          <div className="flex flex-col">
                            <span className="font-semibold">{doc.ownerName}</span>
                            <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">{doc.ownerType}</span>
                          </div>
                        </td>
                        <td className="p-lg text-on-surface-variant">{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                        <td className="p-lg">
                          <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : 'text-on-surface'}>
                            {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                          </span>
                        </td>
                        <td className="p-lg text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isExpired ? 'bg-danger/10 text-danger' : isSoon ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${
                              isExpired ? 'bg-danger' : isSoon ? 'bg-warning' : 'bg-success'
                            }`}></span>
                            {isExpired ? 'Expired' : isSoon ? 'Expiring' : 'Active'}
                          </span>
                        </td>
                        <td className="p-lg text-right space-x-2">
                          <button
                            onClick={() => deleteDocMutation.mutate({ id: doc.id, dbTable: doc.dbTable })}
                            className="px-2.5 py-1 text-xs font-semibold border border-danger/20 text-danger rounded-lg hover:bg-danger/5 transition-colors cursor-pointer"
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
      </div>
    </AdminLayout>
  );
}
