'use client';

import React, { use, useState, useEffect } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { useAuth } from '@/components/providers';
import { compressFile } from '@/utils/compressFile';

const employeeSchema = zod.object({
  first_name: zod.string().min(2, { message: 'First name is required' }),
  last_name: zod.string().min(2, { message: 'Last name is required' }),
  email: zod.string().email().or(zod.string().length(0)).optional(),
  phone: zod.string().or(zod.string().length(0)).optional(),
  designation: zod.string().min(2, { message: 'Designation is required' }),
  labor_card_number: zod.string().optional(),
  labor_card_issue: zod.string().optional(),
  labor_card_expiry: zod.string().optional(),
  visa_number: zod.string().optional(),
  visa_issue: zod.string().optional(),
  visa_expiry: zod.string().optional(),
  passport_number: zod.string().optional(),
  passport_issue: zod.string().optional(),
  passport_expiry: zod.string().optional(),
  photo_url: zod.string().optional(),
});

type EmployeeFormFields = zod.infer<typeof employeeSchema>;

const companyEditSchema = zod.object({
  name: zod.string().min(2, { message: 'Name must be at least 2 characters' }),
  entity_type: zod.enum(['corporate', 'individual']),
  trade_license_number: zod.string().optional(),
  trade_license_issue: zod.string().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Valid issue date is required',
  }).optional(),
  trade_license_expiry: zod.string().optional(),
  vat_number: zod.string().or(zod.string().length(0)).optional(),
  subscription_plan: zod.string().or(zod.string().length(0)).optional(),
  assigned_pro: zod.string().or(zod.string().length(0)).optional(),
  email: zod.string().email({ message: 'Invalid email address' }).or(zod.string().length(0)).optional(),
  phone: zod.string().or(zod.string().length(0)).optional(),
  group_id: zod.string().or(zod.string().length(0)).optional(),
  logo_url: zod.string().optional(),
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

type CompanyEditFormFields = zod.infer<typeof companyEditSchema>;

type CompanyDocumentRow = {
  id?: string;
  file_name?: string | null;
  file_path?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  size_bytes?: number | null;
  document_categories?: {
    name?: string | null;
    code?: string | null;
    category_group?: string | null;
  } | null;
};

type DocumentSummaryFilter = 'all' | 'company' | 'partner';
type CategoryGroup = 'company' | 'partner' | 'employee' | 'family' | 'relative';

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'employees' | 'renewals' | 'activity'>('overview');
  const [documentSummaryFilter, setDocumentSummaryFilter] = useState<DocumentSummaryFilter>('all');
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // Sorting states
  const [documentsSort, setDocumentsSort] = useState<'alpha' | 'created' | 'expiry'>('alpha');
  const [employeesSort, setEmployeesSort] = useState<'alpha' | 'created' | 'visa_expiry' | 'passport_expiry'>('alpha');
  const [empDocsSort, setEmpDocsSort] = useState<'alpha' | 'created' | 'expiry'>('alpha');
  const [documentsSortDir, setDocumentsSortDir] = useState<'asc' | 'desc'>('asc');
  const [employeesSortDir, setEmployeesSortDir] = useState<'asc' | 'desc'>('asc');
  const [empDocsSortDir, setEmpDocsSortDir] = useState<'asc' | 'desc'>('asc');

  const {
    register: registerEmployee,
    handleSubmit: handleSubmitEmployee,
    reset: resetEmployee,
    formState: { errors: employeeErrors },
  } = useForm<EmployeeFormFields>({
    resolver: zodResolver(employeeSchema),
  });

  const {
    register: registerEditEmployee,
    handleSubmit: handleSubmitEditEmployee,
    reset: resetEditEmployee,
    watch: watchEditEmployee,
    formState: { errors: editEmployeeErrors },
  } = useForm<EmployeeFormFields>({
    resolver: zodResolver(employeeSchema),
  });

  const {
    register: registerCompany,
    handleSubmit: handleSubmitCompany,
    reset: resetCompany,
    watch: watchCompany,
    formState: { errors: companyErrors },
  } = useForm<CompanyEditFormFields>({
    resolver: zodResolver(companyEditSchema),
  });

  const editEntityType = watchCompany ? watchCompany('entity_type') : 'corporate';
  const editEmployeePhotoUrl = watchEditEmployee ? watchEditEmployee('photo_url') : '';

  const updateCompanyMutation = useMutation({
    mutationFn: async (fields: CompanyEditFormFields) => {
      const isCorporate = fields.entity_type === 'corporate';
      
      let logoUrl = fields.logo_url || null;
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `logos/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(fileName, logoFile, {
            cacheControl: '3600',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        logoUrl = supabase.storage
          .from('public-assets')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const { data, error } = await supabase
        .from('companies')
        .update({
          name: fields.name,
          entity_type: fields.entity_type,
          trade_license_number: isCorporate ? fields.trade_license_number : null,
          trade_license_issue: (isCorporate && fields.trade_license_issue) ? fields.trade_license_issue : null,
          trade_license_expiry: isCorporate ? fields.trade_license_expiry : null,
          vat_number: fields.vat_number || null,
          subscription_plan: fields.subscription_plan || null,
          assigned_pro: fields.assigned_pro || null,
          email: fields.email || null,
          phone: fields.phone || null,
          group_id: fields.group_id || null,
          logo_url: logoUrl,
        })
        .eq('id', companyId)
        .select()
        .single();
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'COMPANY_UPDATED',
          details: `Updated details for entity: ${fields.name} (type: ${fields.entity_type})`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-details', companyId] });
      setIsEditCompanyModalOpen(false);
      setLogoFile(null);
    },
  });

  const handleOpenEditModal = () => {
    if (company) {
      resetCompany({
        name: company.name,
        entity_type: company.entity_type || 'corporate',
        trade_license_number: company.trade_license_number || '',
        trade_license_issue: company.trade_license_issue || '',
        trade_license_expiry: company.trade_license_expiry || '',
        vat_number: company.vat_number || '',
        subscription_plan: company.subscription_plan || 'Standard',
        assigned_pro: company.assigned_pro || '',
        email: company.email || '',
        phone: company.phone || '',
        group_id: company.group_id || '',
      });
      setIsEditCompanyModalOpen(true);
    }
  };

  // Edit Document state
  const [isEditDocModalOpen, setIsEditDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocIssue, setEditDocIssue] = useState('');
  const [editDocExpiry, setEditDocExpiry] = useState('');
  const [editDocCategory, setEditDocCategory] = useState('');
  const [editDocFile, setEditDocFile] = useState<File | null>(null);

  // Edit Employee Document state
  const [isEditEmpDocModalOpen, setIsEditEmpDocModalOpen] = useState(false);
  const [editingEmpDoc, setEditingEmpDoc] = useState<any | null>(null);
  const [editEmpDocName, setEditEmpDocName] = useState('');
  const [editEmpDocIssue, setEditEmpDocIssue] = useState('');
  const [editEmpDocExpiry, setEditEmpDocExpiry] = useState('');
  const [editEmpDocCategory, setEditEmpDocCategory] = useState('');
  const [editEmpDocCustomCategoryName, setEditEmpDocCustomCategoryName] = useState('');
  const [editEmpDocFile, setEditEmpDocFile] = useState<File | null>(null);

  // Update Company Document Mutation
  const updateDocMutation = useMutation({
    mutationFn: async (fields: { 
      id: string; 
      file_name: string; 
      issue_date: string | null; 
      expiry_date: string | null; 
      category_id: string;
      new_file?: File | null;
      old_file_path?: string;
    }) => {
      let status = 'active';
      if (fields.expiry_date) {
        const exp = new Date(fields.expiry_date);
        const now = new Date();
        const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (exp < now) {
          status = 'expired';
        } else if (exp < soon) {
          status = 'expiring_soon';
        }
      }

      let filePath = fields.old_file_path;
      let fileSize = editingDoc?.size_bytes;

      if (fields.new_file) {
        let fileToUpload = fields.new_file;
        try {
          fileToUpload = await compressFile(fields.new_file);
        } catch (e) {
          console.error('File compression failed, using original', e);
        }
        fileSize = fileToUpload.size;

        let nameWithExt = fields.file_name;
        const originalExtension = fields.new_file.name.split('.').pop();
        if (originalExtension && !nameWithExt.toLowerCase().endsWith(`.${originalExtension.toLowerCase()}`)) {
          nameWithExt = `${nameWithExt}.${originalExtension}`;
        }
        const cleanName = nameWithExt.replace(/[^a-zA-Z0-9_.-]/g, '_');
        
        const isRelative = company?.entity_type === 'individual' && editMainCategory === 'relative';
        const bucket = isRelative ? 'employee-docs' : 'company-docs';
        const uploadFolder = isRelative ? (editingDoc?.employee_id || companyId) : companyId;
        const newPath = `${uploadFolder}/${Date.now()}_${cleanName}`;

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(newPath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });
        if (uploadErr) throw uploadErr;

        filePath = newPath;

        if (fields.old_file_path) {
          const actualOldBucket = editingDoc?.employee_id ? 'employee-docs' : 'company-docs';
          await supabase.storage.from(actualOldBucket).remove([fields.old_file_path]);
        }
      }

      const updatePayload: any = {
        file_name: fields.file_name,
        issue_date: fields.issue_date || null,
        expiry_date: fields.expiry_date || null,
        category_id: fields.category_id,
        status,
      };

      if (fields.new_file && filePath) {
        updatePayload.file_path = filePath;
        updatePayload.size_bytes = fileSize;
      }

      const { data, error } = await supabase
        .from('company_documents')
        .update(updatePayload)
        .eq('id', fields.id)
        .select();
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'COMPANY_DOCUMENT_UPDATED',
          details: `Updated company document: ${fields.file_name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
      setIsEditDocModalOpen(false);
      setEditingDoc(null);
      setEditDocFile(null);
    },
  });

  // Update Employee Document Mutation
  const updateEmpDocMutation = useMutation({
    mutationFn: async (fields: { 
      id: string; 
      file_name: string; 
      issue_date: string | null; 
      expiry_date: string | null; 
      category_id: string;
      customCategoryName?: string;
      new_file?: File | null;
      old_file_path?: string;
    }) => {
      let status = 'active';
      if (fields.expiry_date) {
        const exp = new Date(fields.expiry_date);
        const now = new Date();
        const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (exp < now) {
          status = 'expired';
        } else if (exp < soon) {
          status = 'expiring_soon';
        }
      }

      let filePath = fields.old_file_path;
      let fileSize = editingEmpDoc?.size_bytes;

      if (fields.new_file) {
        let fileToUpload = fields.new_file;
        try {
          fileToUpload = await compressFile(fields.new_file);
        } catch (e) {
          console.error('File compression failed, using original', e);
        }
        fileSize = fileToUpload.size;

        let nameWithExt = fields.file_name;
        const originalExtension = fields.new_file.name.split('.').pop();
        if (originalExtension && !nameWithExt.toLowerCase().endsWith(`.${originalExtension.toLowerCase()}`)) {
          nameWithExt = `${nameWithExt}.${originalExtension}`;
        }
        const cleanName = nameWithExt.replace(/[^a-zA-Z0-9_.-]/g, '_');
        
        const uploadFolder = editingEmpDoc?.employee_id || managedEmployee?.id;
        const newPath = `${uploadFolder}/${Date.now()}_${cleanName}`;

        const { error: uploadErr } = await supabase.storage
          .from('employee-docs')
          .upload(newPath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });
        if (uploadErr) throw uploadErr;

        filePath = newPath;

        if (fields.old_file_path) {
          await supabase.storage.from('employee-docs').remove([fields.old_file_path]);
        }
      }

      let finalCategoryId = fields.category_id;
      if (fields.category_id === 'other') {
        if (!fields.customCategoryName?.trim()) {
          throw new Error('Please enter a custom category name.');
        }
        finalCategoryId = await createCustomCategory(fields.customCategoryName.trim(), company?.entity_type === 'individual' ? 'relative' : 'employee');
      }

      const updatePayload: any = {
        file_name: fields.file_name,
        issue_date: fields.issue_date || null,
        expiry_date: fields.expiry_date || null,
        category_id: finalCategoryId,
        status,
      };

      if (fields.new_file && filePath) {
        updatePayload.file_path = filePath;
        updatePayload.size_bytes = fileSize;
      }

      const { data, error } = await supabase
        .from('employee_documents')
        .update(updatePayload)
        .eq('id', fields.id)
        .select();
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'EMPLOYEE_DOCUMENT_UPDATED',
          details: `Updated employee document: ${fields.file_name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      if (managedEmployee) {
        queryClient.invalidateQueries({ queryKey: ['employee-documents', managedEmployee.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      setIsEditEmpDocModalOpen(false);
      setEditingEmpDoc(null);
      setEditEmpDocFile(null);
    },
  });

  const handleOpenEditDocModal = (doc: any) => {
    setEditingDoc(doc);
    setEditDocName(doc.file_name);
    setEditDocIssue(doc.issue_date || '');
    setEditDocExpiry(doc.expiry_date || '');

    // Use category_group from DB directly (no keyword matching needed)
    const group = doc.document_categories?.category_group as CategoryGroup | undefined;
    setEditMainCategory(group ?? (company?.entity_type === 'individual' ? 'family' : 'company'));
    setEditSubCategory(doc.category_id || '');
    setEditCustomCategoryName('');
    setIsEditDocModalOpen(true);
  };

  const handleOpenEditEmpDocModal = (doc: any) => {
    setEditingDoc(doc); // store general ref
    setEditingEmpDoc(doc);
    setEditEmpDocName(doc.file_name);
    setEditEmpDocIssue(doc.issue_date || '');
    setEditEmpDocExpiry(doc.expiry_date || '');
    setEditEmpDocCategory(doc.category_id || ''); // always use id directly
    setEditEmpDocCustomCategoryName('');
    setIsEditEmpDocModalOpen(true);
  };

  const updateEmployeeMutation = useMutation({
    mutationFn: async (fields: EmployeeFormFields & { id: string }) => {
      let photoUrl = fields.photo_url || null;
      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `employee_profiles/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(fileName, photoFile, {
            cacheControl: '3600',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        photoUrl = supabase.storage
          .from('public-assets')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const { data, error } = await supabase
        .from('employees')
        .update({
          first_name: fields.first_name,
          last_name: fields.last_name,
          email: fields.email || null,
          phone: fields.phone || null,
          designation: fields.designation,
          labor_card_number: fields.labor_card_number || null,
          labor_card_issue: fields.labor_card_issue || null,
          labor_card_expiry: fields.labor_card_expiry || null,
          visa_number: fields.visa_number || null,
          visa_issue: fields.visa_issue || null,
          visa_expiry: fields.visa_expiry || null,
          passport_number: fields.passport_number || null,
          passport_issue: fields.passport_issue || null,
          passport_expiry: fields.passport_expiry || null,
          photo_url: photoUrl,
        })
        .eq('id', fields.id)
        .select()
        .single();
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'EMPLOYEE_UPDATED',
          details: `Updated employee profile: ${fields.first_name} ${fields.last_name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-employees', companyId] });
      setIsEditEmployeeModalOpen(false);
      setEditingEmployeeId(null);
      setPhotoFile(null);
    },
  });

  const handleOpenEditEmployeeModal = (emp: any) => {
    setEditingEmployeeId(emp.id);
    resetEditEmployee({
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email || '',
      phone: emp.phone || '',
      designation: emp.designation || '',
      labor_card_number: emp.labor_card_number || '',
      labor_card_issue: emp.labor_card_issue || '',
      labor_card_expiry: emp.labor_card_expiry || '',
      visa_number: emp.visa_number || '',
      visa_issue: emp.visa_issue || '',
      visa_expiry: emp.visa_expiry || '',
      passport_number: emp.passport_number || '',
      passport_issue: emp.passport_issue || '',
      passport_expiry: emp.passport_expiry || '',
      photo_url: emp.photo_url || '',
    });
    setIsEditEmployeeModalOpen(true);
  };

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

  // Fetch PROs list
  const { data: prosList } = useQuery({
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

  // Fetch Company Groups for selector
  const { data: groupsList } = useQuery({
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

  // Fetch Company Documents
  const { data: documents, isLoading: isDocsLoading } = useQuery({
    queryKey: ['company-documents', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*, document_categories(name, code, category_group)')
        .eq('company_id', companyId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Employee (relative) Documents for this company (used for individual/family summaries)
  const { data: employeeCompanyDocs } = useQuery({
    queryKey: ['company-employee-documents', companyId],
    queryFn: async () => {
      const { data: emps, error: empErr } = await supabase.from('employees').select('id').eq('company_id', companyId);
      if (empErr) throw empErr;
      const employeeIds = (emps || []).map((e: any) => e.id).filter(Boolean);
      if (employeeIds.length === 0) return [];
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*, employees(first_name, last_name, company_id), document_categories(name, code, category_group)')
        .in('employee_id', employeeIds)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
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

  const sortedEmployees = (employees || []).slice().sort((a: any, b: any) => {
    const dir = employeesSortDir === 'asc' ? 1 : -1;
    if (employeesSort === 'alpha') return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`) * dir;
    
    // Helper to get document expiry dynamically
    const getDocExpiry = (empId: string, keyword: string) => {
      const docs = employeeCompanyDocs?.filter((d: any) => d.employee_id === empId) || [];
      const doc = docs.find((d: any) => d.document_categories?.name?.toLowerCase().includes(keyword));
      return doc?.expiry_date ? Date.parse(doc.expiry_date) : 0;
    };

    if (employeesSort === 'visa_expiry') {
      const aExpiry = getDocExpiry(a.id, 'visa') || (a.visa_expiry ? Date.parse(a.visa_expiry) : 0);
      const bExpiry = getDocExpiry(b.id, 'visa') || (b.visa_expiry ? Date.parse(b.visa_expiry) : 0);
      return (aExpiry - bExpiry) * dir;
    }
    if (employeesSort === 'passport_expiry') {
      const aExpiry = getDocExpiry(a.id, 'passport') || (a.passport_expiry ? Date.parse(a.passport_expiry) : 0);
      const bExpiry = getDocExpiry(b.id, 'passport') || (b.passport_expiry ? Date.parse(b.passport_expiry) : 0);
      return (aExpiry - bExpiry) * dir;
    }
    return ((Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0)) * dir;
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

  // Use category_group from DB for partner/family detection (no keyword matching needed)
  const isPartnerDocument = (doc: CompanyDocumentRow) => {
    const grp = doc.document_categories?.category_group;
    return grp === 'partner';
  };

  const getDocumentStatusCounts = (docs: CompanyDocumentRow[]) => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    return docs.reduce(
      (counts, doc) => {
        if (!doc.expiry_date) {
          counts.active += 1;
          return counts;
        }

        const expiryDate = new Date(doc.expiry_date);
        if (expiryDate < today) {
          counts.expired += 1;
        } else if (expiryDate < thirtyDaysFromNow) {
          counts.expiringSoon += 1;
        } else {
          counts.active += 1;
        }

        return counts;
      },
      { active: 0, expiringSoon: 0, expired: 0 }
    );
  };

  const getTopDocumentCategories = (docs: CompanyDocumentRow[]) => {
    const categoryCounts = docs.reduce<Record<string, number>>((counts, doc) => {
      const categoryName = doc.document_categories?.name || 'Other';
      counts[categoryName] = (counts[categoryName] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));
  };

  // For individual entities: family docs are the employee (relative) documents; sponsor docs are partner-type company documents.
  let companyDocumentSummary: any[] = [];
  let partnerDocumentSummary: any[] = [];

  if (company?.entity_type === 'individual') {
    const sponsorDocs = (documents || []).filter((d: any) => d.document_categories?.category_group === 'family');
    const relativeDocs = (employeeCompanyDocs || []).filter((d: any) => d.document_categories?.category_group === 'relative');
    companyDocumentSummary = sponsorDocs;
    partnerDocumentSummary = relativeDocs;
  } else {
    companyDocumentSummary = (documents || []).filter((doc) => !isPartnerDocument(doc));
    partnerDocumentSummary = (documents || []).filter(isPartnerDocument);
  }

  const companyDocumentStatusCounts = getDocumentStatusCounts(companyDocumentSummary);
  const partnerDocumentStatusCounts = getDocumentStatusCounts(partnerDocumentSummary);
  const companyDocumentCategories = getTopDocumentCategories(companyDocumentSummary);
  const partnerDocumentCategories = getTopDocumentCategories(partnerDocumentSummary);

  const visibleCompanyDocuments =
    documentSummaryFilter === 'company'
      ? companyDocumentSummary
      : documentSummaryFilter === 'partner'
        ? partnerDocumentSummary
        : company?.entity_type === 'individual'
          ? [...(companyDocumentSummary || []), ...(partnerDocumentSummary || [])]
          : documents || [];
  // Sorting helpers for visible documents
  const getDocDateValue = (d: any) => {
    const dateStr = d.uploaded_at || d.created_at || d.issue_date || d.expiry_date;
    const t = dateStr ? Date.parse(dateStr) : 0;
    return isNaN(t) ? 0 : t;
  };

  const sortedVisibleDocuments = (visibleCompanyDocuments || []).slice().sort((a: any, b: any) => {
    const dir = documentsSortDir === 'asc' ? 1 : -1;
    if (documentsSort === 'alpha') return (a.file_name || '').localeCompare(b.file_name || '') * dir;
    if (documentsSort === 'expiry') return (((a.expiry_date ? Date.parse(a.expiry_date) : 0) - (b.expiry_date ? Date.parse(b.expiry_date) : 0))) * dir;
    // created
    return (((Date.parse(a.uploaded_at || a.created_at || a.issue_date || '') || 0) - (Date.parse(b.uploaded_at || b.created_at || b.issue_date || '') || 0))) * dir;
  });
  const documentFilterLabel =
    company?.entity_type === 'individual'
      ? (documentSummaryFilter === 'company'
          ? 'Sponsor Documents'
          : documentSummaryFilter === 'partner'
            ? 'Relative Documents'
            : 'All Documents')
      : (documentSummaryFilter === 'company'
          ? 'Company Documents'
          : documentSummaryFilter === 'partner'
            ? 'Partner Documents'
            : 'All Company Documents');

  // Add Employee Mutation
  const addEmployeeMutation = useMutation({
    mutationFn: async (fields: EmployeeFormFields) => {
      let photoUrl = null;
      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `employee_profiles/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(fileName, photoFile, {
            cacheControl: '3600',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        photoUrl = supabase.storage
          .from('public-assets')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const { data, error } = await supabase.from('employees').insert([
        {
          company_id: companyId,
          first_name: fields.first_name,
          last_name: fields.last_name,
          email: fields.email || null,
          phone: fields.phone || null,
          designation: fields.designation,
          labor_card_number: fields.labor_card_number || null,
          labor_card_issue: fields.labor_card_issue || null,
          labor_card_expiry: fields.labor_card_expiry || null,
          visa_number: fields.visa_number || null,
          visa_issue: fields.visa_issue || null,
          visa_expiry: fields.visa_expiry || null,
          passport_number: fields.passport_number || null,
          passport_issue: fields.passport_issue || null,
          passport_expiry: fields.passport_expiry || null,
          photo_url: photoUrl,
          status: 'active',
        },
      ]);
      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'EMPLOYEE_ADDED',
          details: `Added new employee: ${fields.first_name} ${fields.last_name}`,
        },
      ]);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-employees', companyId] });
      setIsEmployeeModalOpen(false);
      setPhotoFile(null);
      resetEmployee();
    },
  });

  // Document Upload & Category States
  const [uploadMainCategory, setUploadMainCategory] = useState<CategoryGroup>('company');
  const [uploadSubCategory, setUploadSubCategory] = useState('');
  const [uploadCustomCategoryName, setUploadCustomCategoryName] = useState('');
  const [uploadRelativeEmployeeId, setUploadRelativeEmployeeId] = useState('');
  const [editMainCategory, setEditMainCategory] = useState<CategoryGroup>('company');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editCustomCategoryName, setEditCustomCategoryName] = useState('');

  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadIssue, setUploadIssue] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // When company type changes, default/lock main categories for individual entities
  useEffect(() => {
    if (!company) return;
    if (company.entity_type === 'individual') {
      setUploadMainCategory('family');
      setEditMainCategory('family');
    } else {
      setUploadMainCategory('company');
      setEditMainCategory('company');
    }
  }, [company?.entity_type]);

  // Helper: create a new custom category and return its id
  const createCustomCategory = async (name: string, group: CategoryGroup): Promise<string> => {
    const type = (group === 'company' || group === 'partner' || group === 'family') ? 'company' : 'employee';
    const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_CUSTOM_' + Date.now();
    const { data, error } = await supabase
      .from('document_categories')
      .insert([{ name, code, type, category_group: group }])
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  };

  // Upload Document Action
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadSubCategory || !selectedFile) {
      alert('Please select a file and a category.');
      return;
    }

    if (uploadSubCategory === 'other' && !uploadCustomCategoryName.trim()) {
      alert('Please enter a custom category name.');
      return;
    }

    setIsUploading(true);

    try {
      let finalCategoryId = uploadSubCategory;

      if (uploadSubCategory === 'other') {
        finalCategoryId = await createCustomCategory(uploadCustomCategoryName.trim(), uploadMainCategory);
      }

      let fileName = uploadFileName || selectedFile.name;
      const originalExtension = selectedFile.name.split('.').pop();
      if (originalExtension && !fileName.toLowerCase().endsWith(`.${originalExtension.toLowerCase()}`)) {
        fileName = `${fileName}.${originalExtension}`;
      }
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      
      // Compress file before uploading
      let finalFileToUpload = selectedFile;
      try {
        finalFileToUpload = await compressFile(selectedFile);
      } catch (e) {
        console.error('File compression failed, using original', e);
      }
      const fileSize = finalFileToUpload.size;

      // If uploading a relative document for an individual entity, store under employee_documents and the 'employee-docs' bucket
      if (company?.entity_type === 'individual' && uploadMainCategory === 'relative') {
        if (!uploadRelativeEmployeeId) {
          alert('Please select the relative to attach this document to.');
          setIsUploading(false);
          return;
        }

        const filePathEmp = `${uploadRelativeEmployeeId}/${Date.now()}_${cleanFileName}`;

        const { error: storageError } = await supabase.storage
          .from('employee-docs')
          .upload(filePathEmp, finalFileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });

        if (storageError) throw storageError;

        const { error: dbError } = await supabase.from('employee_documents').insert([
          {
            employee_id: uploadRelativeEmployeeId,
            category_id: finalCategoryId,
            file_name: fileName,
            file_path: filePathEmp,
            size_bytes: fileSize,
            issue_date: uploadIssue || null,
            expiry_date: uploadExpiry || null,
            status: 'active',
          },
        ]);

        if (dbError) {
          await supabase.storage.from('employee-docs').remove([filePathEmp]);
          throw dbError;
        }

      } else {
        const filePath = `${companyId}/${Date.now()}_${cleanFileName}`;

        // 1. Upload to Supabase Storage Bucket 'company-docs'
        const { error: storageError } = await supabase.storage
          .from('company-docs')
          .upload(filePath, finalFileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });

        if (storageError) throw storageError;

        // 2. Insert record metadata to Database
        const { error: dbError } = await supabase.from('company_documents').insert([
          {
            company_id: companyId,
            category_id: finalCategoryId,
            file_name: fileName,
            file_path: filePath,
            size_bytes: fileSize,
            issue_date: uploadIssue || null,
            expiry_date: uploadExpiry || null,
            status: 'active',
          },
        ]);
        if (dbError) {
          // Rollback storage upload if DB insert fails
          await supabase.storage.from('company-docs').remove([filePath]);
          throw dbError;
        }
      }

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'COMPANY_DOCUMENT_UPLOADED',
          details: `Uploaded company document: ${fileName}`,
        },
      ]);

      if (company?.entity_type === 'individual' && uploadMainCategory === 'relative') {
        queryClient.invalidateQueries({ queryKey: ['employee-documents', uploadRelativeEmployeeId] });
        queryClient.invalidateQueries({ queryKey: ['company-employee-documents', companyId] });
        queryClient.invalidateQueries({ queryKey: ['company-employees', companyId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
      }
      queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      setIsDocModalOpen(false);
      setUploadSubCategory('');
      setUploadCustomCategoryName('');
      setUploadFileName('');
      setUploadIssue('');
      setUploadExpiry('');
      setSelectedFile(null);
      setUploadRelativeEmployeeId('');
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
  const [empDocCustomCategoryName, setEmpDocCustomCategoryName] = useState('');
  const [empDocFileName, setEmpDocFileName] = useState('');
  const [empDocIssue, setEmpDocIssue] = useState('');
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
        .select('*, document_categories(name, category_group)')
        .eq('employee_id', managedEmployee.id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!managedEmployee,
  });

  const sortedEmpDocs = (empDocs || []).slice().sort((a: any, b: any) => {
    const dir = empDocsSortDir === 'asc' ? 1 : -1;
    if (empDocsSort === 'alpha') return (a.file_name || '').localeCompare(b.file_name || '') * dir;
    if (empDocsSort === 'expiry') return ((a.expiry_date ? Date.parse(a.expiry_date) : 0) - (b.expiry_date ? Date.parse(b.expiry_date) : 0)) * dir;
    return ((Date.parse(a.uploaded_at || a.created_at || a.issue_date || '') || 0) - (Date.parse(b.uploaded_at || b.created_at || b.issue_date || '') || 0)) * dir;
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

    if (empDocCategory === 'other' && !empDocCustomCategoryName.trim()) {
      alert('Please enter a custom category name.');
      return;
    }

    setIsUploadingEmpDoc(true);

    try {
      let finalCategoryId = empDocCategory;
      if (empDocCategory === 'other') {
        finalCategoryId = await createCustomCategory(empDocCustomCategoryName.trim(), company?.entity_type === 'individual' ? 'relative' : 'employee');
      }

      let fileName = empDocFileName || empDocFile.name;
      const originalExtension = empDocFile.name.split('.').pop();
      if (originalExtension && !fileName.toLowerCase().endsWith(`.${originalExtension.toLowerCase()}`)) {
        fileName = `${fileName}.${originalExtension}`;
      }
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const filePath = `${managedEmployee.id}/${Date.now()}_${cleanFileName}`;

      // Compress file before uploading
      let finalFileToUpload = empDocFile;
      try {
        finalFileToUpload = await compressFile(empDocFile);
      } catch (e) {
        console.error('File compression failed, using original', e);
      }
      const fileSize = finalFileToUpload.size;

      // 1. Upload to Supabase Storage Bucket 'employee-docs'
      const { error: storageError } = await supabase.storage
        .from('employee-docs')
        .upload(filePath, finalFileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) throw storageError;

      // 2. Insert record metadata to Database
      const { error: dbError } = await supabase.from('employee_documents').insert([
        {
          employee_id: managedEmployee.id,
          category_id: finalCategoryId,
          file_name: fileName,
          file_path: filePath,
          size_bytes: fileSize,
          issue_date: empDocIssue || null,
          expiry_date: empDocExpiry || null,
          status: 'active',
        },
      ]);
      if (dbError) {
        // Rollback storage upload if DB insert fails
        await supabase.storage.from('employee-docs').remove([filePath]);
        throw dbError;
      }

      // Log activity
      await supabase.from('activity_logs').insert([
        {
          user_id: profile?.id || null,
          action: 'EMPLOYEE_DOCUMENT_UPLOADED',
          details: `Uploaded document for employee ${managedEmployee.first_name} ${managedEmployee.last_name}: ${fileName}`,
        },
      ]);

      queryClient.invalidateQueries({ queryKey: ['employee-documents', managedEmployee.id] });
      setEmpDocCategory('');
      setEmpDocCustomCategoryName('');
      setEmpDocFileName('');
      setEmpDocIssue('');
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
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${company.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${company.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                {company.status === 'active' ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <div className="flex gap-md">
            <button
              onClick={() => {
                if (company?.entity_type === 'individual') {
                  setUploadMainCategory(documentSummaryFilter === 'partner' ? 'relative' : 'family');
                }
                setIsDocModalOpen(true);
              }}
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
              <span>{company?.entity_type === 'individual' ? 'Add Relative' : 'Add Employee'}</span>
            </button>
            <a
              href={`mailto:${company.email || ''}`}
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
              onClick={() => {
                if (tab === 'documents') {
                  setDocumentSummaryFilter('all');
                }
                setActiveTab(tab);
              }}
              className={`pb-md font-body-md text-sm capitalize transition-all cursor-pointer ${activeTab === tab
                  ? 'text-primary font-bold border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-primary'
                }`}
            >
              {tab === 'employees'
                ? (company?.entity_type === 'individual' ? 'Family Members' : 'Employees')
                : tab}
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
                  <h3 className="font-title-lg text-title-lg text-on-surface">
                    {company.entity_type === 'individual' ? 'Family / Sponsor Information' : 'Company Information'}
                  </h3>
                  <button
                    onClick={handleOpenEditModal}
                    className="text-primary font-label-md text-label-md font-bold hover:underline cursor-pointer"
                  >
                    Edit Details
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-lg gap-x-xl text-sm">
                  {company.entity_type !== 'individual' && (
                    <>
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Trade License No</p>
                        <p className="font-title-md text-on-surface font-semibold">{company.trade_license_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Trade License Issue Date</p>
                        <p className="font-title-md text-on-surface font-semibold">
                          {company.trade_license_issue ? new Date(company.trade_license_issue).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Trade License Expiry Date</p>
                        <p className="font-title-md text-on-surface font-semibold">
                          {company.trade_license_expiry ? new Date(company.trade_license_expiry).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">VAT Number</p>
                        <p className="font-title-md text-on-surface font-semibold">{company.vat_number || 'N/A'}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Subscription Plan</p>
                    {company.subscription_plan === 'Premium Gold' ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 font-bold text-xs">
                        <span className="material-symbols-outlined text-sm">workspace_premium</span>
                        <span>Premium Gold</span>
                      </span>
                    ) : company.subscription_plan === 'Premium Silver' ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-400/15 text-slate-600 font-bold text-xs">
                        <span className="material-symbols-outlined text-sm">workspace_premium</span>
                        <span>Premium Silver</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-bold text-xs">
                        <span className="material-symbols-outlined text-sm">workspace_premium</span>
                        <span>{company.subscription_plan || 'Standard'}</span>
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Assigned PRO</p>
                    {company.assigned_pro ? (
                      <div className="flex items-center gap-sm">
                        <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-xs">
                          {company.assigned_pro.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <p className="font-title-md text-on-surface font-semibold">{company.assigned_pro}</p>
                      </div>
                    ) : (
                      <p className="font-title-md text-on-surface-variant font-medium">N/A</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Client Email</p>
                    <p className="font-title-md text-on-surface font-semibold">{company.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant mb-1">Client Phone</p>
                    <p className="font-title-md text-on-surface font-semibold">{company.phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Document Summary Card */}
              <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm">
                <h3 className="font-title-lg text-title-lg text-on-surface mb-lg">Documents Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div
                    onClick={() => {
                      setDocumentSummaryFilter('company');
                      setActiveTab('documents');
                    }}
                    className="p-md bg-surface-container-low rounded-xl border border-border-subtle hover:border-primary transition-colors cursor-pointer"
                  >
                    <div className="flex justify-between items-start gap-md mb-md">
                      <span className="material-symbols-outlined text-primary bg-primary-container/10 p-2 rounded-lg">business_center</span>
                      <div className="text-right">
                        <span className="block text-2xl font-extrabold text-on-surface">{companyDocumentSummary.length}</span>
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Uploaded</span>
                      </div>
                    </div>
                    <h4 className="font-title-md text-on-surface font-bold mb-xs">
                      {company?.entity_type === 'individual' ? 'Sponsor Documents' : 'Company Documents'}
                    </h4>
                    <p className="text-xs text-on-surface-variant mb-md">
                      {company?.entity_type === 'individual'
                        ? 'Sponsor or head of family visa, passport, EID and residency files'
                        : 'TL, MOA, POA, certificates and establishment records'}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-md">
                      <span className="px-2 py-1 rounded-full bg-success/10 text-success text-[10px] font-bold">Active {companyDocumentStatusCounts.active}</span>
                      <span className="px-2 py-1 rounded-full bg-warning/10 text-warning text-[10px] font-bold">Soon {companyDocumentStatusCounts.expiringSoon}</span>
                      <span className="px-2 py-1 rounded-full bg-danger/10 text-danger text-[10px] font-bold">Expired {companyDocumentStatusCounts.expired}</span>
                    </div>
                    {companyDocumentCategories.length > 0 ? (
                      <div className="space-y-2">
                        {companyDocumentCategories.map((category) => (
                          <div key={category.name} className="flex items-center justify-between text-xs">
                            <span className="text-on-surface-variant font-medium truncate pr-3">{category.name}</span>
                            <span className="font-bold text-on-surface">{category.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-on-surface-variant">
                        {company?.entity_type === 'individual' ? 'No sponsor documents uploaded.' : 'No company documents uploaded.'}
                      </p>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      setDocumentSummaryFilter('partner');
                      setActiveTab('documents');
                    }}
                    className="p-md bg-surface-container-low rounded-xl border border-border-subtle hover:border-primary transition-colors cursor-pointer"
                  >
                    <div className="flex justify-between items-start gap-md mb-md">
                      <span className="material-symbols-outlined text-warning bg-warning/10 p-2 rounded-lg">group</span>
                      <div className="text-right">
                        <span className="block text-2xl font-extrabold text-on-surface">{partnerDocumentSummary.length}</span>
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Uploaded</span>
                      </div>
                    </div>
                    <h4 className="font-title-md text-on-surface font-bold mb-xs">
                      {company?.entity_type === 'individual' ? 'Relative Documents' : 'Partner Documents'}
                    </h4>
                    <p className="text-xs text-on-surface-variant mb-md">
                      {company?.entity_type === 'individual'
                        ? 'Relative visa, passport, EID and personal records'
                        : 'Partner or sponsor passport, visa, EID and residency files'}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-md">
                      <span className="px-2 py-1 rounded-full bg-success/10 text-success text-[10px] font-bold">Active {partnerDocumentStatusCounts.active}</span>
                      <span className="px-2 py-1 rounded-full bg-warning/10 text-warning text-[10px] font-bold">Soon {partnerDocumentStatusCounts.expiringSoon}</span>
                      <span className="px-2 py-1 rounded-full bg-danger/10 text-danger text-[10px] font-bold">Expired {partnerDocumentStatusCounts.expired}</span>
                    </div>
                    {partnerDocumentCategories.length > 0 ? (
                      <div className="space-y-2">
                        {partnerDocumentCategories.map((category) => (
                          <div key={category.name} className="flex items-center justify-between text-xs">
                            <span className="text-on-surface-variant font-medium truncate pr-3">{category.name}</span>
                            <span className="font-bold text-on-surface">{category.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-on-surface-variant">
                        {company?.entity_type === 'individual' ? 'No relative documents uploaded.' : 'No partner documents uploaded.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4-cols sidebar info */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
              {/* Compliance Overview */}
              <div className="bg-white p-lg rounded-2xl border border-border-subtle shadow-sm text-center flex flex-col justify-between">
                <h3 className="font-title-md text-title-md text-on-surface mb-md">Compliance Overview</h3>
                {(() => {
                  const allDocs = [...(documents || []), ...(employeeCompanyDocs || [])];
                  const totalDocsCount = allDocs.length;
                  const expiredDocsCount = allDocs.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length;
                  const activeDocsCount = totalDocsCount - expiredDocsCount;
                  const complianceRateValue = totalDocsCount > 0 ? Math.round((activeDocsCount / totalDocsCount) * 100) : 100;

                  return (
                    <>
                      <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="72" cy="72" fill="transparent" r="62" stroke="#F1F5F9" strokeWidth="10"></circle>
                          <circle cx="72" cy="72" fill="transparent" r="62" stroke="#10B981" strokeDasharray="390" strokeDashoffset={390 - (390 * complianceRateValue) / 100} strokeWidth="10" strokeLinecap="round"></circle>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-extrabold text-on-surface">{isDocsLoading ? '...' : `${complianceRateValue}%`}</span>
                          <span className="font-label-sm text-label-sm text-success font-bold">Compliant</span>
                        </div>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-md">
                        Based on {totalDocsCount} total {company?.entity_type === 'individual' ? 'family' : 'company'} & {company?.entity_type === 'individual' ? 'relative' : 'employee'} documents
                      </p>
                    </>
                  );
                })()}
              </div>

              <div className="bg-white p-lg border border-border-subtle rounded-2xl shadow-sm">
                <h3 className="font-title-md text-title-md text-on-surface mb-md">Active Renewal Requests</h3>
                <div className="space-y-3">
                  {renewals && renewals.filter((r) => r.status === 'pending' || r.status === 'requested' || r.status === 'in_progress').length > 0 ? (
                    renewals
                      .filter((r) => r.status === 'pending' || r.status === 'requested' || r.status === 'in_progress')
                      .map((req) => (
                        <div key={req.id} className="p-3 bg-surface-container-low border border-border-subtle rounded-lg flex flex-col gap-1.5 text-xs">
                          <span className="font-bold">{req.document_categories?.name || 'Document'} Renewal</span>
                          {req.employees && (
                            <span className="text-on-surface-variant">Employee: {req.employees.first_name} {req.employees.last_name}</span>
                          )}
                          <p className="text-on-surface-variant">{req.details}</p>
                          <span className={`self-start px-2 py-0.5 font-bold rounded-full text-[9px] uppercase ${
                            req.status === 'in_progress'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-warning/15 text-warning'
                          }`}>
                            {req.status === 'in_progress' ? 'In Progress' : 'Requested'}
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
              <div className="p-lg border-b border-border-subtle flex flex-col md:flex-row md:justify-between md:items-center gap-md bg-bg-subtle">
                <div>
                  <h3 className="font-title-md text-title-md text-on-surface">{documentFilterLabel}</h3>
                  {documentSummaryFilter !== 'all' && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      Showing documents selected from overview summary.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-sm">
                  <div className="flex items-center gap-2">
                    <select
                      value={documentsSort}
                      onChange={(e) => setDocumentsSort(e.target.value as any)}
                      className="bg-white border border-border-subtle rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="alpha">Alphabetical</option>
                      <option value="created">Date Created</option>
                      <option value="expiry">Expiry Date</option>
                    </select>
                    <button
                      onClick={() => setDocumentsSortDir(documentsSortDir === 'asc' ? 'desc' : 'asc')}
                      className="px-2 py-1 bg-white border border-border-subtle rounded-lg text-xs"
                      title="Toggle sort direction"
                    >
                      {documentsSortDir === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                  </div>
                  {documentSummaryFilter !== 'all' && (
                    <button
                      onClick={() => setDocumentSummaryFilter('all')}
                      className="px-md py-1.5 bg-white border border-border-subtle text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container-low cursor-pointer"
                    >
                      Show All
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (company?.entity_type === 'individual') {
                        setUploadMainCategory(documentSummaryFilter === 'partner' ? 'relative' : 'family');
                      }
                      setIsDocModalOpen(true);
                    }}
                    className="px-md py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:brightness-110 cursor-pointer"
                  >
                    Upload New Document
                  </button>
                </div>
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
                    ) : sortedVisibleDocuments.length > 0 ? (
                      sortedVisibleDocuments.map((doc) => {
                        const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                        const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                        return (
                          <tr key={doc.id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="p-lg font-bold">{doc.file_name}</td>
                            <td className="p-lg text-on-surface-variant font-medium">
                              {doc.document_categories?.name || 'Other'}
                            </td>
                            <td className="p-lg text-on-surface-variant">{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                            <td className="p-lg">
                              <div className="flex flex-col text-xs text-on-surface-variant font-medium">
                                <span>Issue: {doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'N/A'}</span>
                                <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : ''}>
                                  Expiry: {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                                </span>
                              </div>
                            </td>
                            <td className="p-lg">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${isExpired ? 'bg-danger/10 text-danger' : isSoon ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                                }`}>
                                <span className={`w-1 h-1 rounded-full ${isExpired ? 'bg-danger' : isSoon ? 'bg-warning' : 'bg-success'
                                  }`}></span>
                                {isExpired ? 'Expired' : isSoon ? 'Expiring Soon' : 'Active'}
                              </span>
                            </td>
                            <td className="p-lg text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => doc.employee_id ? handleViewEmpDoc(doc.file_path) : handleViewDoc(doc.file_path)}
                                  className="inline-flex items-center justify-center w-[76px] px-2.5 py-1 text-xs font-semibold border border-border-subtle text-primary rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                                >
                                  Open
                                </button>
                                <button
                                  onClick={() => doc.employee_id ? handleOpenEditEmpDocModal(doc) : handleOpenEditDocModal(doc)}
                                  className="inline-flex items-center justify-center w-[76px] px-2.5 py-1 text-xs font-semibold border border-border-subtle text-on-surface rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this document?')) {
                                      if (doc.employee_id) {
                                        deleteEmpDocMutation.mutate({ id: doc.id, filePath: doc.file_path });
                                      } else {
                                        deleteDocMutation.mutate({ id: doc.id, filePath: doc.file_path });
                                      }
                                    }
                                  }}
                                  className="inline-flex items-center justify-center w-[76px] px-2.5 py-1 text-xs font-semibold border border-danger/20 text-danger rounded-lg hover:bg-danger/5 transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
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
                <h3 className="font-title-md text-title-md text-on-surface">
                  {company?.entity_type === 'individual' ? 'Family Members / Relatives' : 'Employee Roster'}
                </h3>
                <div className="flex items-center gap-sm">
                  <div className="flex items-center gap-2">
                    <select
                      value={employeesSort}
                      onChange={(e) => setEmployeesSort(e.target.value as any)}
                      className="bg-white border border-border-subtle rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="alpha">Alphabetical</option>
                      <option value="created">Date Created</option>
                      <option value="visa_expiry">Visa Expiry</option>
                      <option value="passport_expiry">Passport Expiry</option>
                    </select>
                    <button
                      onClick={() => setEmployeesSortDir(employeesSortDir === 'asc' ? 'desc' : 'asc')}
                      className="px-2 py-1 bg-white border border-border-subtle rounded-lg text-xs"
                      title="Toggle sort direction"
                    >
                      {employeesSortDir === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                  </div>
                  <button
                    onClick={() => setIsEmployeeModalOpen(true)}
                    className="px-md py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:brightness-110 cursor-pointer"
                  >
                    {company?.entity_type === 'individual' ? 'Add Relative' : 'Add Employee'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-border-subtle font-bold text-on-surface-variant text-[11px] uppercase tracking-wider">
                      <th className="p-lg">Name</th>
                      <th className="p-lg">{company?.entity_type === 'individual' ? 'Relationship' : 'Designation'}</th>
                      <th className="p-lg">Visa Expiry</th>
                      <th className="p-lg">Passport Expiry</th>
                      <th className="p-lg text-center">Status</th>
                      <th className="p-lg text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle font-body-sm text-on-surface">
                    {isEmployeesLoading ? (
                      <tr>
                        <td colSpan={6} className="p-xl text-center">
                          {company?.entity_type === 'individual' ? 'Loading relative list...' : 'Loading employee list...'}
                        </td>
                      </tr>
                    ) : sortedEmployees && sortedEmployees.length > 0 ? (
                      sortedEmployees.map((emp) => {
                        const empDocs = employeeCompanyDocs?.filter((d: any) => d.employee_id === emp.id) || [];
                        const visaDoc = empDocs.find((d: any) => d.document_categories?.name?.toLowerCase().includes('visa'));
                        const passportDoc = empDocs.find((d: any) => d.document_categories?.name?.toLowerCase().includes('passport'));

                        const derivedVisaExpiry = visaDoc?.expiry_date || emp.visa_expiry || null;
                        const derivedPassportExpiry = passportDoc?.expiry_date || emp.passport_expiry || null;

                        const isVisaExpired = derivedVisaExpiry && new Date(derivedVisaExpiry) < new Date();
                        const isPassportExpired = derivedPassportExpiry && new Date(derivedPassportExpiry) < new Date();

                        return (
                          <tr key={emp.id} className="hover:bg-surface-container-lowest transition-colors">
                            <td className="p-lg font-bold">{emp.first_name} {emp.last_name}</td>
                            <td className="p-lg text-on-surface-variant font-medium">{emp.designation}</td>
                            <td className="p-lg">
                              <span className={isVisaExpired ? 'text-danger font-bold' : ''}>
                                {derivedVisaExpiry ? new Date(derivedVisaExpiry).toLocaleDateString() : 'N/A'}
                              </span>
                            </td>
                            <td className="p-lg">
                              <span className={isPassportExpired ? 'text-danger font-bold' : ''}>
                                {derivedPassportExpiry ? new Date(derivedPassportExpiry).toLocaleDateString() : 'N/A'}
                              </span>
                            </td>
                            <td className="p-lg text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${emp.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                                }`}>
                                <span className={`w-1 h-1 rounded-full ${emp.status === 'active' ? 'bg-success' : 'bg-danger'}`}></span>
                                {emp.status}
                              </span>
                            </td>
                            <td className="p-lg text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setManagedEmployee(emp)}
                                  className="inline-flex items-center justify-center w-[106px] px-2.5 py-1 text-xs font-semibold border border-border-subtle text-primary rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
                                >
                                  Manage Docs
                                </button>
                                <button
                                  onClick={() => handleOpenEditEmployeeModal(emp)}
                                  className="inline-flex items-center justify-center w-[76px] px-2.5 py-1 text-xs font-semibold border border-border-subtle text-on-surface rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete employee ${emp.first_name} ${emp.last_name}?`)) {
                                      deleteEmployeeMutation.mutate(emp.id);
                                    }
                                  }}
                                  className="inline-flex items-center justify-center w-[76px] px-2.5 py-1 text-xs font-semibold border border-danger/20 text-danger rounded-lg hover:bg-danger/5 transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
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
                            req.status === 'pending' || req.status === 'requested'
                              ? 'bg-warning/10 text-warning'
                              : req.status === 'in_progress'
                                ? 'bg-primary/10 text-primary'
                                : req.status === 'approved'
                                  ? 'bg-success/10 text-success'
                                  : 'bg-danger/10 text-danger'
                          }`}>
                            {req.status === 'in_progress' ? 'In Progress' : req.status}
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

      {/* Edit Company Details Modal */}
      {isEditCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">
                {editEntityType === 'corporate' ? 'Edit Company Details' : 'Edit Family Details'}
              </h3>
              <button
                onClick={() => {
                  setIsEditCompanyModalOpen(false);
                  resetCompany();
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitCompany((data) => updateCompanyMutation.mutate(data))} className="space-y-4">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Entity Type</label>
                <select
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                  {...registerCompany('entity_type')}
                >
                  <option value="corporate">Corporate Business</option>
                  <option value="individual">Individual / Family</option>
                </select>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">
                  {editEntityType === 'corporate' ? 'Company Name' : 'Family / Sponsor Name'}
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                  {...registerCompany('name')}
                />
                {companyErrors.name && (
                  <p className="mt-1 text-danger text-[10px] font-semibold">{companyErrors.name.message}</p>
                )}
              </div>

              {editEntityType === 'corporate' && (
                <>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1">Trade License No</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                      {...registerCompany('trade_license_number')}
                    />
                    {companyErrors.trade_license_number && (
                      <p className="mt-1 text-danger text-[10px] font-semibold">{companyErrors.trade_license_number.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-sm">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1">Trade License Issue</label>
                      <input
                        type="date"
                        className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                        {...registerCompany('trade_license_issue')}
                      />
                      {companyErrors.trade_license_issue && (
                        <p className="mt-1 text-danger text-[10px] font-semibold">{companyErrors.trade_license_issue.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1">Trade License Expiry</label>
                      <input
                        type="date"
                        className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                        {...registerCompany('trade_license_expiry')}
                      />
                      {companyErrors.trade_license_expiry && (
                        <p className="mt-1 text-danger text-[10px] font-semibold">{companyErrors.trade_license_expiry.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1">VAT Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 100239485700003"
                      className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                      {...registerCompany('vat_number')}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Subscription Plan</label>
                <select
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                  {...registerCompany('subscription_plan')}
                >
                  <option value="Standard">Standard</option>
                  <option value="Premium Silver">Premium Silver</option>
                  <option value="Premium Gold">Premium Gold</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Contact Email</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerCompany('email')}
                  />
                  {companyErrors.email && (
                    <p className="mt-1 text-danger text-[10px] font-semibold">{companyErrors.email.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Contact Phone</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerCompany('phone')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Assigned PRO</label>
                <select
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                  {...registerCompany('assigned_pro')}
                >
                  <option value="">Unassigned</option>
                  {prosList?.map((pro: any) => (
                    <option key={pro.id} value={pro.name}>
                      {pro.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Entity Group (Optional)</label>
                <select
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                  {...registerCompany('group_id')}
                >
                  <option value="">Standalone Entity (No Group)</option>
                  {groupsList?.map((group: any) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">
                  {editEntityType === 'corporate' ? 'Company Logo (Optional)' : 'Profile Picture (Optional)'}
                </label>
                <div className="flex items-center gap-4">
                  {(logoFile || company?.logo_url) && (
                    <img
                      src={logoFile ? URL.createObjectURL(logoFile) : company.logo_url}
                      alt="Logo preview"
                      className="w-12 h-12 rounded-lg object-cover border border-border-subtle"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full text-xs text-on-surface-variant file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setLogoFile(file);
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCompanyModalOpen(false);
                    resetCompany();
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateCompanyMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                >
                  {updateCompanyMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">
                {company?.entity_type === 'individual' ? 'Add Relative' : 'Add Employee'}
              </h3>
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
                <label className="block text-label-md text-on-surface-variant mb-1">
                  {company?.entity_type === 'individual' ? 'Relationship' : 'Designation'}
                </label>
                <input
                  type="text"
                  placeholder={company?.entity_type === 'individual' ? 'e.g. Spouse, Child, Parent' : 'e.g. Sales Director'}
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

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Profile Photo (Optional)</label>
                <div className="flex items-center gap-4">
                  {photoFile && (
                    <img
                      src={URL.createObjectURL(photoFile)}
                      alt="Profile preview"
                      className="w-12 h-12 rounded-full object-cover border border-border-subtle"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full text-xs text-on-surface-variant file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setPhotoFile(file);
                    }}
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
                  {addEmployeeMutation.isPending ? 'Saving...' : (company?.entity_type === 'individual' ? 'Add Relative' : 'Add Employee')}
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
              {company?.entity_type !== 'individual' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Category</label>
                  <select
                    required
                    value={uploadMainCategory}
                    onChange={(e) => {
                      setUploadMainCategory(e.target.value as CategoryGroup);
                      setUploadSubCategory('');
                    }}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  >
                    <option value="company">Company Document</option>
                    <option value="partner">Partner Document</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Sub Category</label>
                <select
                  required
                  value={uploadSubCategory}
                  onChange={(e) => setUploadSubCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                >
                  <option value="">Select sub category...</option>
                  {categories
                    ?.filter((cat) => cat.category_group === uploadMainCategory)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  <option value="other">Others (Create New Category)</option>
                </select>
              </div>

              {/* For individual companies, if selecting Relative category, allow picking which relative */}
              {company?.entity_type === 'individual' && uploadMainCategory === 'relative' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Attach To Relative</label>
                  <select
                    required
                    value={uploadRelativeEmployeeId}
                    onChange={(e) => setUploadRelativeEmployeeId(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  >
                    <option value="">Select relative...</option>
                    {employees?.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {uploadSubCategory === 'other' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Custom Category Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Special Agreement"
                    value={uploadCustomCategoryName}
                    onChange={(e) => setUploadCustomCategoryName(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm"
                  />
                </div>
              )}

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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Issue Date (Optional)</label>
                  <input
                    type="date"
                    value={uploadIssue}
                    onChange={(e) => setUploadIssue(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-2">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={uploadExpiry}
                    onChange={(e) => setUploadExpiry(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white"
                  />
                </div>
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
                  {isUploading ? 'Compressing & Uploading...' : 'Upload Document'}
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
                  setEmpDocCustomCategoryName('');
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
                    <label className="block text-label-sm text-on-surface-variant mb-1">Document Type</label>
                    <select
                      required
                      value={empDocCategory}
                      onChange={(e) => {
                        setEmpDocCategory(e.target.value);
                        if (e.target.value !== 'other') {
                          setEmpDocCustomCategoryName('');
                        }
                      }}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs bg-white"
                    >
                      <option value="">Select category...</option>
                      {categories
                        ?.filter((cat) =>
                          cat.category_group === (company?.entity_type === 'individual' ? 'relative' : 'employee')
                        )
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      <option value="other">Others (Create New Category)</option>
                    </select>
                    {empDocCategory === 'other' && (
                      <div className="mt-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Custom Category Name</label>
                        <input
                          type="text"
                          value={empDocCustomCategoryName}
                          onChange={(e) => setEmpDocCustomCategoryName(e.target.value)}
                          placeholder="e.g. Medical Certificate"
                          className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs"
                        />
                      </div>
                    )}
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
                    <label className="block text-label-sm text-on-surface-variant mb-1">Issue Date (Optional)</label>
                    <input
                      type="date"
                      value={empDocIssue}
                      onChange={(e) => setEmpDocIssue(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs bg-white focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Expiry Date (Optional)</label>
                    <input
                      type="date"
                      value={empDocExpiry}
                      onChange={(e) => setEmpDocExpiry(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border-subtle rounded-lg text-xs bg-white focus:outline-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploadingEmpDoc}
                    className="w-full py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                  >
                    {isUploadingEmpDoc ? 'Compressing & Uploading...' : 'Upload Document'}
                  </button>
                </form>
              </div>

              {/* Documents List Column */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="font-title-md text-title-md text-on-surface">Registered Documents</h4>

                <div className="flex items-center justify-between">
                  <div />
                  <div className="flex items-center gap-2">
                    <select
                      value={empDocsSort}
                      onChange={(e) => setEmpDocsSort(e.target.value as any)}
                      className="bg-white border border-border-subtle rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="alpha">Alphabetical</option>
                      <option value="created">Date Created</option>
                      <option value="expiry">Expiry Date</option>
                    </select>
                    <button
                      onClick={() => setEmpDocsSortDir(empDocsSortDir === 'asc' ? 'desc' : 'asc')}
                      className="px-2 py-1 bg-white border border-border-subtle rounded-lg text-xs"
                      title="Toggle sort direction"
                    >
                      {empDocsSortDir === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                  </div>
                </div>

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
                        ) : sortedEmpDocs && sortedEmpDocs.length > 0 ? (
                          sortedEmpDocs.map((doc) => {
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
                                  <div className="flex flex-col text-xs text-on-surface-variant font-medium">
                                    <span>Issue: {doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'N/A'}</span>
                                    <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : ''}>
                                      Expiry: {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                                    </span>
                                  </div>
                                </td>
                                 <td className="p-md text-right whitespace-nowrap">
                                   <div className="flex items-center justify-end gap-1.5">
                                     <button
                                       onClick={() => handleViewEmpDoc(doc.file_path)}
                                       className="inline-flex items-center justify-center w-[68px] px-2 py-0.5 text-[10px] font-semibold border border-border-subtle text-primary rounded hover:bg-primary/5 transition-colors cursor-pointer"
                                     >
                                       Open
                                     </button>
                                     <button
                                       onClick={() => handleOpenEditEmpDocModal(doc)}
                                       className="inline-flex items-center justify-center w-[68px] px-2 py-0.5 text-[10px] font-semibold border border-border-subtle text-on-surface rounded hover:bg-surface-container transition-colors cursor-pointer"
                                     >
                                       Edit
                                     </button>
                                     <button
                                       onClick={() => {
                                         if (confirm('Are you sure you want to delete this document?')) {
                                           deleteEmpDocMutation.mutate({ id: doc.id, filePath: doc.file_path });
                                         }
                                       }}
                                       className="inline-flex items-center justify-center w-[68px] px-2 py-0.5 text-[10px] font-semibold border border-danger/20 text-danger rounded hover:bg-danger/5 transition-colors cursor-pointer"
                                     >
                                       Delete
                                     </button>
                                   </div>
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

      {/* Edit Company Document Modal */}
      {isEditDocModalOpen && editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">Edit Company Document</h3>
              <button
                onClick={() => {
                  setIsEditDocModalOpen(false);
                  setEditingDoc(null);
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editSubCategory) {
                  alert('Please select a category.');
                  return;
                }
                if (editSubCategory === 'other' && !editCustomCategoryName.trim()) {
                  alert('Please enter a custom category name.');
                  return;
                }

                let finalCategoryId = editSubCategory;

                try {
                  if (editSubCategory === 'other') {
                    finalCategoryId = await createCustomCategory(editCustomCategoryName.trim(), editMainCategory);
                  }

                  updateDocMutation.mutate({
                    id: editingDoc.id,
                    file_name: editDocName,
                    issue_date: editDocIssue || null,
                    expiry_date: editDocExpiry || null,
                    category_id: finalCategoryId,
                    new_file: editDocFile,
                    old_file_path: editingDoc.file_path,
                  });
                } catch (err: any) {
                  alert('Failed to save category: ' + err.message);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">File Name (Display Label)</label>
                <input
                  type="text"
                  required
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                />
              </div>

              {company?.entity_type !== 'individual' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Category</label>
                  <select
                    required
                    value={editMainCategory}
                    onChange={(e) => {
                      setEditMainCategory(e.target.value as CategoryGroup);
                      setEditSubCategory('');
                    }}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                  >
                    <option value="company">Company Document</option>
                    <option value="partner">Partner Document</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Sub Category</label>
                <select
                  required
                  value={editSubCategory}
                  onChange={(e) => setEditSubCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                >
                  <option value="">Select sub category...</option>
                  {categories
                    ?.filter((cat) => cat.category_group === editMainCategory)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  <option value="other">Others (Create New Category)</option>
                </select>
              </div>

              {editSubCategory === 'other' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Custom Category Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Special Agreement"
                    value={editCustomCategoryName}
                    onChange={(e) => setEditCustomCategoryName(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Issue Date (Optional)</label>
                  <input
                    type="date"
                    value={editDocIssue}
                    onChange={(e) => setEditDocIssue(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={editDocExpiry}
                    onChange={(e) => setEditDocExpiry(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Replace Document File (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setEditDocFile(e.target.files[0]);
                    }
                  }}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface-container file:text-on-surface hover:file:bg-surface-container-high"
                />
                {editingDoc && !editDocFile && (
                  <p className="text-xs text-on-surface-variant mt-1">Current file: <span className="font-semibold">{editingDoc.file_name}</span></p>
                )}
                {editDocFile && (
                  <p className="text-xs text-success mt-1 font-semibold">New file selected: {editDocFile.name}</p>
                )}
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditDocModalOpen(false);
                    setEditingDoc(null);
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateDocMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                >
                  {updateDocMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Document Modal */}
      {isEditEmpDocModalOpen && editingEmpDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">Edit Employee Document</h3>
              <button
                onClick={() => {
                  setIsEditEmpDocModalOpen(false);
                  setEditingEmpDoc(null);
                  setEditEmpDocCategory('');
                  setEditEmpDocCustomCategoryName('');
                  setEditEmpDocFile(null);
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                updateEmpDocMutation.mutate({
                  id: editingEmpDoc.id,
                  file_name: editEmpDocName,
                  issue_date: editEmpDocIssue || null,
                  expiry_date: editEmpDocExpiry || null,
                  category_id: editEmpDocCategory,
                  customCategoryName: editEmpDocCustomCategoryName,
                  new_file: editEmpDocFile,
                  old_file_path: editingEmpDoc.file_path,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">File Name (Display Label)</label>
                <input
                  type="text"
                  required
                  value={editEmpDocName}
                  onChange={(e) => setEditEmpDocName(e.target.value)}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                />
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Document Type</label>
                <select
                  required
                  value={editEmpDocCategory}
                  onChange={(e) => {
                    setEditEmpDocCategory(e.target.value);
                    if (e.target.value !== 'other') {
                      setEditEmpDocCustomCategoryName('');
                    }
                  }}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm bg-white focus:outline-primary"
                >
                  <option value="">Select category...</option>
                  {categories
                    ?.filter((cat) =>
                      cat.category_group === (company?.entity_type === 'individual' ? 'relative' : 'employee')
                    )
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  <option value="other">Others (Create New Category)</option>
                </select>
                {editEmpDocCategory === 'other' && (
                  <div className="mt-2">
                    <label className="block text-label-md text-on-surface-variant mb-1">Custom Category Name</label>
                    <input
                      type="text"
                      value={editEmpDocCustomCategoryName}
                      onChange={(e) => setEditEmpDocCustomCategoryName(e.target.value)}
                      placeholder="e.g. Medical Certificate"
                      className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Issue Date (Optional)</label>
                  <input
                    type="date"
                    value={editEmpDocIssue}
                    onChange={(e) => setEditEmpDocIssue(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={editEmpDocExpiry}
                    onChange={(e) => setEditEmpDocExpiry(e.target.value)}
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Replace Document File (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setEditEmpDocFile(e.target.files[0]);
                    }
                  }}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary bg-white file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface-container file:text-on-surface hover:file:bg-surface-container-high"
                />
                {editingEmpDoc && !editEmpDocFile && (
                  <p className="text-xs text-on-surface-variant mt-1">Current file: <span className="font-semibold">{editingEmpDoc.file_name}</span></p>
                )}
                {editEmpDocFile && (
                  <p className="text-xs text-success mt-1 font-semibold">New file selected: {editEmpDocFile.name}</p>
                )}
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditEmpDocModalOpen(false);
                    setEditingEmpDoc(null);
                    setEditEmpDocCategory('');
                    setEditEmpDocCustomCategoryName('');
                    setEditEmpDocFile(null);
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateEmpDocMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                >
                  {updateEmpDocMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditEmployeeModalOpen && editingEmployeeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-bold text-on-surface">
                {company?.entity_type === 'individual' ? 'Edit Relative' : 'Edit Employee'}
              </h3>
              <button
                onClick={() => {
                  setIsEditEmployeeModalOpen(false);
                  setEditingEmployeeId(null);
                }}
                className="p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form
              onSubmit={handleSubmitEditEmployee((data) =>
                updateEmployeeMutation.mutate({ ...data, id: editingEmployeeId })
              )}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">First Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerEditEmployee('first_name')}
                  />
                  {editEmployeeErrors.first_name && (
                    <p className="mt-1 text-danger text-[10px] font-semibold">{editEmployeeErrors.first_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Last Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerEditEmployee('last_name')}
                  />
                  {editEmployeeErrors.last_name && (
                    <p className="mt-1 text-danger text-[10px] font-semibold">{editEmployeeErrors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">
                  {company?.entity_type === 'individual' ? 'Relationship' : 'Designation'}
                </label>
                <input
                  type="text"
                  placeholder={company?.entity_type === 'individual' ? 'e.g. Spouse, Child, Parent' : 'e.g. Sales Director'}
                  className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                  {...registerEditEmployee('designation')}
                />
                {editEmployeeErrors.designation && (
                  <p className="mt-1 text-danger text-[10px] font-semibold">{editEmployeeErrors.designation.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerEditEmployee('email')}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1">Phone</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-primary"
                    {...registerEditEmployee('phone')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1">Profile Photo (Optional)</label>
                <div className="flex items-center gap-4">
                  {(photoFile || editEmployeePhotoUrl) && (
                    <img
                      src={photoFile ? URL.createObjectURL(photoFile) : editEmployeePhotoUrl}
                      alt="Profile preview"
                      className="w-12 h-12 rounded-full object-cover border border-border-subtle"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full text-xs text-on-surface-variant file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setPhotoFile(file);
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-sm justify-end pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditEmployeeModalOpen(false);
                    setEditingEmployeeId(null);
                  }}
                  className="px-lg py-2 bg-white border border-border-subtle rounded-lg text-body-sm font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateEmployeeMutation.isPending}
                  className="px-lg py-2 bg-primary text-white rounded-lg text-body-sm font-semibold hover:brightness-110 disabled:bg-primary/50 transition-all cursor-pointer"
                >
                  {updateEmployeeMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
