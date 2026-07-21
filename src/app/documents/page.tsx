'use client';

import React, { useState } from 'react';
import AdminLayout from '@/components/admin-layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'name', 'visa', 'passport', 'labour'
  const [isDragActive, setIsDragActive] = useState(false);
  const [documentOrder, setDocumentOrder] = useState<string[]>([]);

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
        supabase.from('company_documents').select('*, companies(name), document_categories(name, id, category_group)').order('order_index', { ascending: true, nullsFirst: false }),
        supabase.from('employee_documents').select('*, employees(first_name, last_name, companies(name, id)), document_categories(name, id, category_group)').order('order_index', { ascending: true, nullsFirst: false }),
      ]);

      if (companyDocsRes.error) throw companyDocsRes.error;
      if (employeeDocsRes.error) throw employeeDocsRes.error;

      // Map company documents
      const cDocs = (companyDocsRes.data || []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
         category: doc.document_categories?.name || 'Other',
        categoryId: doc.document_categories?.id,
        categoryGroup: doc.document_categories?.category_group || 'company',
        companyName: doc.companies?.name || 'N/A',
        companyId: doc.company_id,
        ownerType: doc.document_categories?.category_group === 'partner' ? 'Partner' : 'Company',
        ownerName: doc.owner_name || doc.companies?.name || 'N/A',
        size_bytes: doc.size_bytes,
        issue_date: doc.issue_date,
        expiry_date: doc.expiry_date,
        status: doc.status,
        dbTable: 'company_documents',
        orderIndex: doc.order_index,
      }));

      // Map employee documents
      const eDocs = (employeeDocsRes.data || []).map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        category: doc.document_categories?.name || 'Other',
        categoryId: doc.document_categories?.id,
        categoryGroup: doc.document_categories?.category_group || 'employee',
        companyName: doc.employees?.companies?.name || 'N/A',
        companyId: doc.employees?.companies?.id,
        ownerType: 'Employee',
        ownerName: doc.employees ? `${doc.employees.first_name} ${doc.employees.last_name}` : 'N/A',
        size_bytes: doc.size_bytes,
        issue_date: doc.issue_date,
        expiry_date: doc.expiry_date,
        status: doc.status,
        dbTable: 'employee_documents',
        orderIndex: doc.order_index,
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
    const matchesOwnerType = ownerTypeFilter === 'all' || doc.categoryGroup === ownerTypeFilter;

    return matchesSearch && matchesCategory && matchesCompany && matchesOwnerType;
  });

  // Sorting Logic - Group by category_group first, then apply sorting
  const sortedDocs = [...filteredDocs].sort((a, b) => {
    // If in drag mode, use the custom order
    if (isDragActive && documentOrder.length > 0) {
      return documentOrder.indexOf(a.id) - documentOrder.indexOf(b.id);
    }

    // Group by category_group first
    const groupOrder = { company: 0, partner: 1, employee: 2, family: 3, relative: 4 };
    const aGroup = groupOrder[a.categoryGroup as keyof typeof groupOrder] ?? 99;
    const bGroup = groupOrder[b.categoryGroup as keyof typeof groupOrder] ?? 99;
    
    if (aGroup !== bGroup) {
      return aGroup - bGroup;
    }

    // Within same group, use order_index if available
    if (a.orderIndex !== undefined && b.orderIndex !== undefined && a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }

    // Otherwise use the selected sort method
    switch (sortBy) {
      case 'name':
        return a.file_name.localeCompare(b.file_name);
      case 'visa':
        return compareExpiryDates(a, b, 'Visa');
      case 'passport':
        return compareExpiryDates(a, b, 'Passport');
      case 'labour':
        return compareExpiryDates(a, b, 'Labour Card');
      case 'date':
      default:
        return new Date(b.issue_date || 0).getTime() - new Date(a.issue_date || 0).getTime();
    }
  });

  // Helper function to compare expiry dates for specific document types
  const compareExpiryDates = (a: any, b: any, docType: string) => {
    const aIsType = a.category.toLowerCase().includes(docType.toLowerCase());
    const bIsType = b.category.toLowerCase().includes(docType.toLowerCase());
    
    if (aIsType && bIsType) {
      // Both are the specified type, sort by expiry date
      const aDate = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const bDate = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      return aDate - bDate;
    } else if (aIsType) {
      // Only a is the specified type, show it first
      return -1;
    } else if (bIsType) {
      // Only b is the specified type, show it first
      return 1;
    } else {
      // Neither is the specified type, maintain original order
      return 0;
    }
  };

  // Drag and Drop Row Component
  const DraggableRow = ({ doc, index, moveRow }: { doc: any, index: number, moveRow: (dragIndex: number, hoverIndex: number) => void }) => {
    const ref = React.useRef<HTMLTableRowElement>(null);
    
    const [{ isDragging }, drag] = useDrag({
      type: 'DOCUMENT',
      item: { id: doc.id, index },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [, drop] = useDrop({
      accept: 'DOCUMENT',
      hover(item: { id: string, index: number }) {
        if (!ref.current) return;
        const dragIndex = item.index;
        const hoverIndex = index;
        
        if (dragIndex === hoverIndex) return;
        
        moveRow(dragIndex, hoverIndex);
        item.index = hoverIndex;
      },
    });

    drag(drop(ref));

    // Calculate expiry status for this document
    const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
    const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return (
      <tr
        ref={ref}
        key={doc.id}
        className={`hover:bg-surface-container-lowest transition-colors ${isDragging ? 'opacity-50' : ''}`}
        style={{ cursor: isDragActive ? 'move' : 'default' }}
      >
        <td className="p-lg font-bold text-on-surface flex items-center gap-2">
          {isDragActive && <span className="material-symbols-outlined text-primary text-base mr-2">drag_handle</span>}
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
          <div className="flex flex-col text-xs text-on-surface-variant font-medium">
            <span>Issue: {doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'N/A'}</span>
            <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : 'text-on-surface'}>
              Expiry: {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
            </span>
          </div>
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
  };

  const moveRow = (dragIndex: number, hoverIndex: number) => {
    const newOrder = [...documentOrder];
    const draggedItem = sortedDocs[dragIndex];
    const hoverItem = sortedDocs[hoverIndex];
    
    // Prevent dragging across different category groups
    if (draggedItem.categoryGroup !== hoverItem.categoryGroup) {
      return;
    }
    
    // Remove the dragged item from its current position
    newOrder.splice(dragIndex, 1);
    // Insert it at the new position
    newOrder.splice(hoverIndex, 0, draggedItem.id);
    
    setDocumentOrder(newOrder);
  };

  const toggleDragMode = () => {
    if (!isDragActive) {
      // Initialize document order when entering drag mode
      setDocumentOrder(sortedDocs.map(doc => doc.id));
    }
    setIsDragActive(!isDragActive);
  };

  const saveNewOrder = async () => {
    try {
      // Group documents by category_group and assign order_index within each group
      const groupOrder = { company: 0, partner: 1, employee: 2, family: 3, relative: 4 };
      const groups: Record<string, any[]> = {};
      
      documentOrder.forEach((id, index) => {
        const doc = sortedDocs.find(d => d.id === id);
        if (doc) {
          const group = doc.categoryGroup || 'company';
          if (!groups[group]) groups[group] = [];
          groups[group].push({ doc, originalIndex: index });
        }
      });
      
      // Calculate order_index for each document within its group
      const updates: any[] = [];
      Object.keys(groups).forEach(group => {
        const groupDocs = groups[group];
        groupDocs.forEach(({ doc }, groupIndex) => {
          // Calculate global order_index based on group position and position within group
          const groupOffset = groupOrder[group as keyof typeof groupOrder] * 1000;
          const finalOrderIndex = groupOffset + groupIndex;
          
          updates.push(
            supabase
              .from(doc.dbTable)
              .update({ order_index: finalOrderIndex })
              .eq('id', doc.id)
          );
        });
      });
      
      await Promise.all(updates.map(u => u.then()));
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
      setIsDragActive(false);
      setDocumentOrder([]);
    } catch (error) {
      console.error('Failed to save document order:', error);
      alert('Failed to save document order');
    }
  };

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
              value={ownerTypeFilter}
              onChange={(e) => setOwnerTypeFilter(e.target.value)}
              className="bg-white border border-border-subtle rounded-lg px-md py-2 text-body-sm focus:ring-primary"
            >
              <option value="all">All Document Types</option>
              <option value="company">Company Docs</option>
              <option value="partner">Partner Docs</option>
              <option value="employee">Employee Docs</option>
              <option value="family">Family Docs</option>
              <option value="relative">Relative Docs</option>
            </select>

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

        {/* Drag and Drop Controls */}
        <div className="bg-white p-md rounded-2xl border border-border-subtle shadow-sm flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold text-on-surface">Document Ordering</h3>
            <button
              onClick={toggleDragMode}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${isDragActive ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}
            >
              {isDragActive ? 'Cancel Reordering' : 'Change Order'}
            </button>
            {isDragActive && (
              <button
                onClick={saveNewOrder}
                className="px-4 py-2 bg-success/10 text-success rounded-lg font-medium text-sm hover:bg-success/20 transition-colors"
              >
                Save Order
              </button>
            )}
          </div>
          {isDragActive && (
            <p className="text-sm text-on-surface-variant">Drag and drop documents to reorder them</p>
          )}
        </div>

        {/* Documents Table */}
        <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-bg-subtle border-b border-border-subtle text-label-sm text-on-surface-variant font-bold">
                  <th className="p-lg">
                    <div className="flex items-center gap-2">
                      File Name
                      <button onClick={() => setSortBy('name')} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Sort</button>
                    </div>
                  </th>
                  <th className="p-lg">Company Owner</th>
                  <th className="p-lg">Type</th>
                  <th className="p-lg">Associated Profile</th>
                  <th className="p-lg">Size</th>
                  <th className="p-lg">
                    <div className="flex items-center gap-2">
                      Expiry Date
                      <div className="flex gap-1">
                        <button onClick={() => setSortBy('visa')} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Visa</button>
                        <button onClick={() => setSortBy('passport')} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Passport</button>
                        <button onClick={() => setSortBy('labour')} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Labour</button>
                      </div>
                    </div>
                  </th>
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
                ) : sortedDocs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-xl text-center text-on-surface-variant">
                      No files registered matching filters.
                    </td>
                  </tr>
                ) : (
                  <>
                    {(() => {
                      const groupOrder = { company: 0, partner: 1, employee: 2, family: 3, relative: 4 };
                      const groupNames = { company: 'Company Documents', partner: 'Partner Documents', employee: 'Employee Documents', family: 'Family Documents', relative: 'Relative Documents' };
                      let lastGroup: string | null = null;
                      
                      return sortedDocs.map((doc, index) => {
                        const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
                        const isSoon = doc.expiry_date && !isExpired && new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                        const currentGroup = doc.categoryGroup;
                        const showHeader = currentGroup !== lastGroup;
                        lastGroup = currentGroup;
                        
                        return (
                          <React.Fragment key={doc.id}>
                            {showHeader && (
                              <tr className={`font-bold text-primary uppercase text-xs tracking-wider ${isDragActive ? 'bg-primary/10 border-b-2 border-primary' : 'bg-primary/5'}`}>
                                <td colSpan={8} className="p-sm">
                                  {groupNames[currentGroup as keyof typeof groupNames] || currentGroup}
                                  {isDragActive && <span className="ml-2 text-[10px] text-on-surface-variant normal-case tracking-normal">(drag within this group only)</span>}
                                </td>
                              </tr>
                            )}
                            {isDragActive ? (
                              <DndProvider backend={HTML5Backend}>
                                <DraggableRow
                                  doc={doc}
                                  index={index}
                                  moveRow={moveRow}
                                />
                              </DndProvider>
                            ) : (
                              <tr className="hover:bg-surface-container-lowest transition-colors">
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
                                  <div className="flex flex-col text-xs text-on-surface-variant font-medium">
                                    <span>Issue: {doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'N/A'}</span>
                                    <span className={isExpired ? 'text-danger font-bold' : isSoon ? 'text-warning font-bold' : 'text-on-surface'}>
                                      Expiry: {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                                    </span>
                                  </div>
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
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
