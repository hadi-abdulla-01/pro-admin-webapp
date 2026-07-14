'use client';

import React, { use, useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';

const employeeSchema = zod.object({
  first_name: zod.string().min(2, { message: 'First name is required' }),
  last_name: zod.string().min(2, { message: 'Last name is required' }),
  email: zod.string().email().or(zod.string().length(0)).optional(),
  phone: zod.string().or(zod.string().length(0)).optional(),
  designation: zod.string().min(2, { message: 'Designation is required' }),
  labor_card_number: zod.string().optional(),
  labor_card_expiry: zod.string().optional(),
  visa_number: zod.string().optional(),
  visa_expiry: zod.string().optional(),
  passport_number: zod.string().optional(),
  passport_expiry: zod.string().optional(),
});

type EmployeeFormFields = zod.infer<typeof employeeSchema>;

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'employees' | 'renewals' | 'activity'>('overview');
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);

  const {
    register: registerEmployee,
    handleSubmit: handleSubmitEmployee,
    reset: resetEmployee,
    formState: { errors: employeeErrors },
  } = useForm<EmployeeFormFields>({
    resolver: zodResolver(employeeSchema),
  });

  // Fetch Company Details
  const { data: company, isLoading: isCompanyLoading } = useQuery({
    queryKey: ['company-details', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch Company Documents
  const { data: documents, isLoading: isDocsLoading } = useQuery({
    queryKey: ['company-documents', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*, document_categories(name, code)')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Company Employees
  const { data: employees, isLoading: isEmployeesLoading } = useQuery({
    queryKey: ['company-employees', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId)
        .order('first_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Document Categories
  const { data: categories } = useQuery({
    queryKey: ['document-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Company Renewals
  const { data: renewals } = useQuery({
    queryKey: ['company-renewals', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_requests')
        .select('*, document_categories(name, code), employees(first_name, last_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Add Employee Mutation
  const addEmployeeMutation = useMutation({
    mutationFn: async (fields: EmployeeFormFields) => {
      const { data, error } = await supabase.from('employees').insert([
        {
          company_id: companyId,
          first_name: fields.first_name,
          last_name: fields.last_name,
          email: fields.email || null,
          phone: fields.phone || null,
          designation: fields.designation,
          labor_card_number: fields.labor_card_number || null,
          labor_card_expiry: fields.labor_card_expiry || null,
          visa_number: fields.visa_number || null,
          visa_expiry: fields.visa_expiry || null,
          passport_number: fields.passport_number || null,
          passport_expiry: fields.passport_expiry || null,
          status: 'active',
        },
      ]);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-employees', companyId] });
      setIsEmployeeModalOpen(false);
      resetEmployee();
    },
  });

  // Document Upload State
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Upload Document Action
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadCategory || !selectedFile) {
      alert('Please select a file and a category.');
      return;
    }
    setIsUploading(true);

    try {
      const fileName = uploadFileName || selectedFile.name;
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filePath = `${companyId}/${Date.now()}_${cleanFileName}`;

      // 1. Upload to Supabase Storage Bucket 'company-docs'
      const { error: storageError } = await supabase.storage
        .from('company-docs')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) throw storageError;

      // 2. Insert record metadata to Database
      const { error: dbError } = await supabase.from('company_documents').insert([
        {
          company_id: companyId,
          category_id: uploadCategory,
          file_name: fileName,
          file_path: filePath,
          size_bytes: selectedFile.size,
          expiry_date: uploadExpiry || null,
          status: 'active',
        },
      ]);
      if (dbError) {
        // Rollback storage upload if DB insert fails
        await supabase.storage.from('company-docs').remove([filePath]);
        throw dbError;
      }

      queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
      setIsDocModalOpen(false);
      setUploadCategory('');
      setUploadFileName('');
      setUploadExpiry('');
      setSelectedFile(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + (err.message || err));
    } finally {
      setIsUploading(false);
    }
  };

  // Open / View Document Link
  const handleViewDoc = async (filePath: string) => {
    if (!filePath) return;
    try {
      const { data, error } = await supabase.storage
        .from('company-docs')
        .createSignedUrl(filePath, 300); // Link valid for 5 minutes

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        alert('Could not retrieve preview link for this file.');
      }
    } catch (err: any) {
      console.error('Error generating signed link:', err);
      alert('Error: ' + (err.message || err));
    }
  };

  // Delete Document Action
  const deleteDocMutation = useMutation({
    mutationFn: async (doc: { id: string; filePath: string }) => {
      // 1. Remove file from storage if path exists
      if (doc.filePath) {
        const { error: storageError } = await supabase.storage
          .from('company-docs')
          .remove([doc.filePath]);
        if (storageError) {
          console.warn('Failed to delete file from storage bucket:', storageError);
        }
      }
      // 2. Remove metadata row from DB
      const { error } = await supabase.from('company_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
    },
  });

  // Employee Documents Management State
  const [managedEmployee, setManagedEmployee] = useState<any | null>(null);
  const [empDocCategory, setEmpDocCategory] = useState('');
  const [empDocFileName, setEmpDocFileName] = useState('');
  const [empDocExpiry, setEmpDocExpiry] = useState('');
  const [empDocFile, setEmpDocFile] = useState<File | null>(null);
  const [isUploadingEmpDoc, setIsUploadingEmpDoc] = useState(false);

  // Fetch Managed Employee Documents
  const { data: empDocs, isLoading: isEmpDocsLoading } = useQuery({
    queryKey: ['employee-documents', managedEmployee?.id],
    queryFn: async () => {
      if (!managedEmployee) return [];
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*, document_categories(name)')
        .eq('employee_id', managedEmployee.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!managedEmployee,
  });

  // Delete Employee Action
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (empId: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', empId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-employees', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-details', companyId] });
    },
  });

  // Upload Employee Document Action
  const handleUploadEmpDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedEmployee || !empDocCategory || !empDocFile) {
      alert('Please select a file and a category.');
      return;
    }
    setIsUploadingEmpDoc(true);

    try {
      const fileName = empDocFileName || empDocFile.name;
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filePath = `${managedEmployee.id}/${Date.now()}_${cleanFileName}`;

      // 1. Upload to Supabase Storage Bucket 'employee-docs'
      const { error: storageError } = await supabase.storage
        .from('employee-docs')
        .upload(filePath, empDocFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) throw storageError;

      // 2. Insert record metadata to Database
      const { error: dbError } = await supabase.from('employee_documents').insert([
        {
          employee_id: managedEmployee.id,
          category_id: empDocCategory,
          file_name: fileName,
          file_path: filePath,
          size_bytes: empDocFile.size,
          expiry_date: empDocExpiry || null,
          status: 'active',
        },
      ]);
      if (dbError) {
        // Rollback storage upload if DB insert fails
        await supabase.storage.from('employee-docs').remove([filePath]);
        throw dbError;
      }

      queryClient.invalidateQueries({ queryKey: ['employee-documents', managedEmployee.id] });
      setEmpDocCategory('');
      setEmpDocFileName('');
      setEmpDocExpiry('');
      setEmpDocFile(null);
      
      const fileInput = document.getElementById('emp-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      console.error('Upload employee doc error:', err);
      alert('Upload failed: ' + (err.message || err));
    } finally {
      setIsUploadingEmpDoc(false);
    }
  };

  // Open / View Employee Document Link
  const handleViewEmpDoc = async (filePath: string) => {
    if (!filePath) return;
    try {
      const { data, error } = await supabase.storage
        .from('employee-docs')
        .createSignedUrl(filePath, 300); // Link valid for 5 minutes

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        alert('Could not retrieve preview link for this file.');
      }
    } catch (err: any) {
      console.error('Error generating signed link:', err);
      alert('Error: ' + (err.message || err));
    }
  };

  // Delete Employee Document Action
  const deleteEmpDocMutation = useMutation({
    mutationFn: async (doc: { id: string; filePath: string }) => {
      // 1. Remove file from storage if path exists
      if (doc.filePath) {
        const { error: storageError } = await supabase.storage
          .from('employee-docs')
          .remove([doc.filePath]);
        if (storageError) {
          console.warn('Failed to delete file from storage bucket:', storageError);
        }
      }
      // 2. Remove metadata row from DB
      const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (managedEmployee) {
        queryClient.invalidateQueries({ queryKey: ['employee-documents', managedEmployee.id] });
      }
    },
  });

  if (isCompanyLoading) {
    return (
      <AdminLayout>
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-body-md text-on-surface-variant font-semibold">Loading company profile...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!company) {
    return (
      <AdminLayout>
        <div className="p-xl bg-white rounded-xl border border-border-subtle text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-4 text-danger">error</span>
          <h2 className="text-title-lg font-bold mb-2">Company Not Found</h2>
          <p className="text-body-md mb-4">The company you are trying to view does not exist or has been deleted.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-lg">
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-xl">
          <div>
            <div className="flex items-center gap-md mb-xs">
              <h1 className="font-display text-display text-on-surface text-3xl font-extrabold">{company.name}</h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                company.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${company.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                {company.status === 'active' ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="flex items-center gap-sm text-on-surface-variant font-body-md text-sm">
              <span className="material-symbols-outlined text-sm">location_on</span>
              <span>Level 14, Al Maqam Tower, Abu Dhabi Global Market, UAE</span>
            </div>
          </div>
          <div className="flex gap-md">
            <button
              onClick={() => setIsDocModalOpen(true)}
              className="flex items-center gap-2 px-md py-2 bg-white border border-border-subtle rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-all text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">upload</span>
              <span>Upload Doc</span>
            </button>
            <button
              onClick={() => setIsEmployeeModalOpen(true)}
              className="flex items-center gap-2 px-md py-2 bg-white border border-border-subtle rounded-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-low transition-all text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span>Add Employee</span>
            </button>
            <a
              href={`mailto:contact@${company.name.toLowerCase().replace(/\s+/g, '')}.ae`}
              className="flex items-center gap-2 px-md py-2 bg-primary text-white rounded-lg font-label-md text-label-md hover:brightness-110 transition-all shadow-sm text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              <span>Contact Client</span>
            </a>
          </div>
        </section>

        {/* Tab Navigation */}
        <nav className="flex gap-xl border-b border-outline-variant mb-xl">
          {(['overview', 'documents', 'employees', 'renewals'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-md font-body-md text-sm capitalize transition-all cursor-pointer ${
                activeTab === tab
                  ? 'text-primary font-bold border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Overview Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-12 gap-lg">
            {/* Left 8-cols info */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
              {/* General Details */}
              <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm">
                <div className="flex justify-between items-center mb-lg">
                  <h3 className="font-title-lg text-title-lg text-on-surface">Company Information</h3>
                  <button className="text-primary font-label-md text-label-md font-bold hover:underline">Edit Details</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-lg gap-x-xl text-sm">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Trade License No</p>
                    <p className="font-title-md text-on-surface font-semibold">{company.trade_license_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">VAT Number</p>
                    <p className="font-title-md text-on-surface font-semibold">100239485700003</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Subscription Plan</p>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-bold text-xs">
                      <span className="material-symbols-outlined text-sm">workspace_premium</span>
                      <span>Premium Gold</span>
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Assigned PRO</p>
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-xs">
                        SJ
                      </div>
                      <p className="font-title-md text-on-surface font-semibold">Sarah Jenkins</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Summary Card */}
              <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm">
                <h3 className="font-title-lg text-title-lg text-on-surface mb-lg">Documents Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                  <div
                    onClick={() => setActiveTab('documents')}
                    className="p-md bg-surface-container-low rounded-xl border border-border-subtle hover:border-primary transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-sm">
                      <span className="material-symbols-outlined text-primary bg-primary-container/10 p-2 rounded-lg">gavel</span>
                      <span className="text-[11px] font-bold text-on-surface-variant">Legal</span>
                    </div>
                    <h4 className="font-title-md text-on-surface font-bold mb-xs">Licensing Docs</h4>
                    <p className="text-xs text-on-surface-variant">MOA, Power of Attorney, Certificates</p>
                  </div>
                  <div
                    onClick={() => setActiveTab('documents')}
                    className="p-md bg-surface-container-low rounded-xl border border-border-subtle hover:border-primary transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-sm">
                      <span className="material-symbols-outlined text-warning bg-warning/10 p-2 rounded-lg">password</span>
                      <span className="text-[11px] font-bold text-on-surface-variant">Immigration</span>
                    </div>
                    <h4 className="font-title-md text-on-surface font-bold mb-xs">Visas & Entry</h4>
                    <p className="text-xs text-on-surface-variant">Quota documents, Establishment cards</p>
                  </div>
                  <div
                    onClick={() => setActiveTab('documents')}
                    className="p-md bg-surface-container-low rounded-xl border border-border-subtle hover:border-primary transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-sm">
                      <span className="material-symbols-outlined text-success bg-success/10 p-2 rounded-lg">work</span>
                      <span className="text-[11px] font-bold text-on-surface-variant">Labour</span>
                    </div>
                    <h4 className="font-title-md text-on-surface font-bold mb-xs">Labour Permits</h4>
                    <p className="text-xs text-on-surface-variant">Work contracts, labor cards</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4-cols sidebar info */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
              <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm">
                <h3 className="font-title-md text-title-md text-on-surface mb-md">Active Renewal Requests</h3>
                <div className="space-y-3">
                  {renewals && renewals.filter((r) => r.status === 'pending').length > 0 ? (
                    renewals
                      .filter((r) => r.status === 'pending')
                      .map((req) => (
                        <div key={req.id} className="p-3 bg-surface-container-low border border-border-subtle rounded-lg flex flex-col gap-1.5 text-xs">
                          <span className="font-bold">{req.document_categories?.name || 'Document'} Renewal</span>
                          {req.employees && (
                            <span className="text-on-surface-variant">Employee: {req.employees.first_name} {req.employees.last_name}</span>
                          )}
                          <p className="text-on-surface-variant">{req.details}</p>
                          <span className="self-start px-2 py-0.5 bg-warning/15 text-warning font-bold rounded-full text-[9px] uppercase">
                            Pending Admin Action
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-xs text-on-surface-variant text-center py-4">No active renewal requests.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab Content */}
        {activeTab === 'documents' && (
          <div className="space-y-md">
            <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
              <div className="p-lg border-b border-border-subtle flex justify-between items-center bg-bg-subtle">
                <h3 className="font-title-md text-title-md text-on-surface">Company Documents</h3>
                <button
                  onClick={() => setIsDocModalOpen(true)}
                  className="px-md py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:brightness-110 cursor-pointer"
                >
                  Upload New Document
                </button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-border-subtle font-bold text-on-surface-variant text-[11px] uppercase tracking-wider">
                      <th className="p-lg">File Name</th>
                      <th className="p-lg">Category</th>
                      <th className="p-lg">Size</th>
                      <th className="p-lg">Expiry Date</th>
                      <th className="p-lg">Status</th>
                      <th className="p-lg text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                    {isDocsLoading ? (
                      <tr>
                        <td colSpan={6} className="p-xl text-center">Loading files...</td>
                      </tr>
                    ) : documents && documents.length > 0 ? (
                      documents.map((doc) => {
                        const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                        const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                        return (
                          <tr key={doc.id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="p-lg font-bold">{doc.file_name}</td>
                            <td className="p-lg text-on-surface-variant font-medium">{doc.document_categories?.name || 'Other'}</td>
                            <td className="p-lg text-on-surface-variant">{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                            <td className="p-lg">
                              <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : ''}>
                                {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                              </span>
                            </td>
                            <td className="p-lg">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                isExpired ? 'bg-danger/10 text-danger' : isSoon ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                              }`}>
                                <span className={`w-1 h-1 rounded-full ${
                                  isExpired ? 'bg-danger' : isSoon ? 'bg-warning' : 'bg-success'
                                }`}></span>
                                {isExpired ? 'Expired' : isSoon ? 'Expiring Soon' : 'Active'}
                              </span>
                            </td>
                            <td className="p-lg text-right space-x-2">
                              <button
                                onClick={() => handleViewDoc(doc.file_path)}
                                className="px-2.5 py-1 text-xs font-semibold border border-border-subtle text-primary rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this document?')) {
                                    deleteDocMutation.mutate({ id: doc.id, filePath: doc.file_path });
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-semibold border border-danger/20 text-danger rounded-lg hover:bg-danger/5 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-xl text-center text-on-surface-variant">No documents registered.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Employees Tab Content */}
        {activeTab === 'employees' && (
          <div className="space-y-md">
            <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
              <div className="p-lg border-b border-border-subtle flex justify-between items-center bg-bg-subtle">
                <h3 className="font-title-md text-title-md text-on-surface">Employee Roster</h3>
                <button
                  onClick={() => setIsEmployeeModalOpen(true)}
                  className="px-md py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:brightness-110 cursor-pointer"
                >
                  Add Employee
                </button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-border-subtle font-bold text-on-surface-variant text-[11px] uppercase tracking-wider">
                      <th className="p-lg">Name</th>
                      <th className="p-lg">Designation</th>
                      <th className="p-lg">Visa Expiry</th>
                      <th className="p-lg">Passport Expiry</th>
                      <th className="p-lg text-center">Status</th>
                      <th className="p-lg text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                    {isEmployeesLoading ? (
                      <tr>
                        <td colSpan={6} className="p-xl text-center">Loading employee list...</td>
                      </tr>
                    ) : employees && employees.length > 0 ? (
                      employees.map((emp) => {
                        const isVisaExpired = emp.visa_expiry && new Date(emp.visa_expiry) < new Date();
                        const isPassportExpired = emp.passport_expiry && new Date(emp.passport_expiry) < new Date();

                        return (
                          <tr key={emp.id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="p-lg font-bold">{emp.first_name} {emp.last_name}</td>
                            <td className="p-lg text-on-surface-variant font-medium">{emp.designation}</td>
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
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                emp.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                              }`}>
                                <span className={`w-1 h-1 rounded-full ${emp.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                                {emp.status}
                              </span>
                            </td>
                            <td className="p-lg text-right space-x-2">
                              <button
                                onClick={() => setManagedEmployee(emp)}
                                className="px-2.5 py-1 text-xs font-semibold border border-border-subtle text-primary rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                              >
                                Manage Docs
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete employee ${emp.first_name} ${emp.last_name}?`)) {
                                    deleteEmployeeMutation.mutate(emp.id);
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-semibold border border-danger/20 text-danger rounded-lg hover:bg-danger/5 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-xl text-center text-on-surface-variant">No employees registered.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Renewals Tab Content */}
        {activeTab === 'renewals' && (
          <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
            <div className="p-lg border-b border-border-subtle bg-bg-subtle">
              <h3 className="font-title-md text-title-md text-on-surface">Renewal Log</h3>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-surface-container-low border-b border-border-subtle font-bold text-on-surface-variant text-[11px] uppercase tracking-wider">
                    <th className="p-lg">Date</th>
                    <th className="p-lg">Document Type</th>
                    <th className="p-lg">Subject</th>
                    <th className="p-lg">Request Details</th>
                    <th className="p-lg text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                  {renewals && renewals.length > 0 ? (
                    renewals.map((req) => (
                      <tr key={req.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-lg text-on-surface-variant">{new Date(req.created_at).toLocaleDateString()}</td>
                        <td className="p-lg font-bold">{req.document_categories?.name || 'Document'}</td>
                        <td className="p-lg">
                          {req.employees ? (
                            <span>Employee: {req.employees.first_name} {req.employees.last_name}</span>
                          ) : (
                            <span>Company Level</span>
                          )}
                        </td>
                        <td className="p-lg max-w-xs truncate text-on-surface-variant">{req.details}</td>
                        <td className="p-lg text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            req.status === 'pending'
                              ? 'bg-warning/10 text-warning'
                              : req.status === 'approved'
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-xl text-center text-on-surface-variant">No renewal log entries.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">Add Employee</h3>
              <button
                onClick={() => {
                  setIsEmployeeModalOpen(false);
                  resetEmployee();
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitEmployee((data) => addEmployeeMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">First Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                    {...registerEmployee('first_name')}
                  />
                  {employeeErrors.first_name && (
                    <p className="mt-1 text-danger text-[10px] font-semibold">{employeeErrors.first_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Last Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                    {...registerEmployee('last_name')}
                  />
                  {employeeErrors.last_name && (
                    <p className="mt-1 text-danger text-[10px] font-semibold">{employeeErrors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Sales Director"
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  {...registerEmployee('designation')}
                />
                {employeeErrors.designation && (
                  <p className="mt-1 text-danger text-[10px] font-semibold">{employeeErrors.designation.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                    {...registerEmployee('email')}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Phone</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                    {...registerEmployee('phone')}
                  />
                </div>
              </div>

              <hr className="border-border-subtle my-4" />
              <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Government IDs & Expiries</h4>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Visa Number</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-xs"
                    {...registerEmployee('visa_number')}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Visa Expiry</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-xs"
                    {...registerEmployee('visa_expiry')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Passport Number</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-xs"
                    {...registerEmployee('passport_number')}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Passport Expiry</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-xs"
                    {...registerEmployee('passport_expiry')}
                  />
                </div>
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmployeeModalOpen(false);
                    resetEmployee();
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addEmployeeMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all"
                >
                  {addEmployeeMutation.isPending ? 'Saving...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">Upload Document</h3>
              <button
                onClick={() => setIsDocModalOpen(false)}
                className="p-1 rounded-full hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form onSubmit={handleUploadDoc} className="space-y-6">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Document Category</label>
                <select
                  required
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                >
                  <option value="">Select category...</option>
                  {categories?.filter((cat) => cat.type === 'company' || !cat.type).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Select File</label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                    if (file && !uploadFileName) {
                      setUploadFileName(file.name);
                    }
                  }}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">File Name (Display Label)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Trade_License.pdf"
                  value={uploadFileName}
                  onChange={(e) => setUploadFileName(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={uploadExpiry}
                  onChange={(e) => setUploadExpiry(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                />
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all"
                >
                  {isUploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Manage Employee Documents Modal */}
      {managedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-4xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-title-lg font-bold text-on-surface">Manage Employee Documents</h3>
                <p className="text-body-sm text-on-surface-variant">
                  Employee: <span className="font-semibold text-primary">{managedEmployee.first_name} {managedEmployee.last_name}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setManagedEmployee(null);
                  setEmpDocCategory('');
                  setEmpDocFileName('');
                  setEmpDocExpiry('');
                  setEmpDocFile(null);
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
              {/* Upload Form Column */}
              <div className="md:col-span-1 border-r border-border-subtle pr-md space-y-4">
                <h4 className="font-title-md text-title-md text-on-surface">Upload Document</h4>
                
                <form onSubmit={handleUploadEmpDoc} className="space-y-4">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Document Category</label>
                    <select
                      required
                      value={empDocCategory}
                      onChange={(e) => setEmpDocCategory(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs bg-white"
                    >
                      <option value="">Select category...</option>
                      {categories?.filter((cat) => cat.type === 'employee').map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Select File</label>
                    <input
                      id="emp-file-input"
                      type="file"
                      required
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setEmpDocFile(file);
                        if (file && !empDocFileName) {
                          setEmpDocFileName(file.name);
                        }
                      }}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">File Name (Display Label)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Passport_Copy.pdf"
                      value={empDocFileName}
                      onChange={(e) => setEmpDocFileName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Expiry Date (Optional)</label>
                    <input
                      type="date"
                      value={empDocExpiry}
                      onChange={(e) => setEmpDocExpiry(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploadingEmpDoc}
                    className="w-full py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                  >
                    {isUploadingEmpDoc ? 'Uploading...' : 'Upload Document'}
                  </button>
                </form>
              </div>

              {/* Documents List Column */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="font-title-md text-title-md text-on-surface">Registered Documents</h4>

                <div className="border border-border-subtle rounded-xl overflow-hidden bg-bg-subtle">
                  <div className="overflow-x-auto custom-scrollbar max-h-[50vh]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-surface-container-low border-b border-border-subtle font-bold text-on-surface-variant text-[10px] uppercase tracking-wider">
                          <th className="p-md">File Name</th>
                          <th className="p-md">Category</th>
                          <th className="p-md">Expiry</th>
                          <th className="p-md text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle bg-white font-body-sm text-on-surface">
                        {isEmpDocsLoading ? (
                          <tr>
                            <td colSpan={4} className="p-lg text-center">Loading documents...</td>
                          </tr>
                        ) : empDocs && empDocs.length > 0 ? (
                          empDocs.map((doc) => {
                            const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                            const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                            return (
                              <tr key={doc.id} className="hover:bg-surface-container-lowest transition-colors">
                                <td className="p-md font-bold truncate max-w-[150px]" title={doc.file_name}>
                                  {doc.file_name}
                                </td>
                                <td className="p-md text-on-surface-variant font-medium">
                                  {doc.document_categories?.name || 'Other'}
                                </td>
                                <td className="p-md">
                                  <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : ''}>
                                    {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                                  </span>
                                </td>
                                <td className="p-md text-right space-x-1 whitespace-nowrap">
                                  <button
                                    onClick={() => handleViewEmpDoc(doc.file_path)}
                                    className="px-2 py-0.5 text-[10px] font-semibold border border-border-subtle text-primary rounded hover:bg-primary/5 transition-colors cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm('Are you sure you want to delete this document?')) {
                                        deleteEmpDocMutation.mutate({ id: doc.id, filePath: doc.file_path });
                                      }
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-semibold border border-danger/20 text-danger rounded hover:bg-danger/5 transition-colors cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-lg text-center text-on-surface-variant">No documents uploaded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
