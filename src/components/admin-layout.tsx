'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers';

interface SidebarItem {
  name: string;
  href: string;
  icon: string;
}

const sidebarItems: SidebarItem[] = [
  { name: 'Dashboard', href: '/', icon: 'dashboard' },
  { name: 'Companies', href: '/companies', icon: 'business' },
  { name: 'Renewals', href: '/renewals', icon: 'event_repeat' },
  { name: 'Notifications', href: '/notifications', icon: 'notifications' },
  { name: 'Support Requests', href: '/support', icon: 'help_center' },
  { name: 'Reports', href: '/reports', icon: 'bar_chart' },
  { name: 'Users & Roles', href: '/users', icon: 'group' },
  { name: 'Settings', href: '/settings', icon: 'settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (profile && profile.roles?.name !== 'admin') {
        // Not an admin
        signOut().then(() => router.push('/login?error=unauthorized'));
      }
    }
  }, [user, profile, loading, router, signOut]);

  if (loading || !user || (profile && profile.roles?.name !== 'admin')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-body-md font-medium text-secondary">Loading PRO Services Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-on-surface">
      {/* Side Navigation Shell */}
      <aside className="fixed left-0 top-0 h-screen w-72 bg-secondary flex flex-col shadow-md z-50 text-white">
        {/* Brand Header */}
        <div className="px-lg py-xl flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center text-white font-black text-xl">
            PRO
          </div>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md font-bold leading-tight">PRO Services</span>
            <span className="text-secondary-fixed-dim/60 font-label-sm uppercase tracking-wider text-[10px]">
              Enterprise Admin
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 px-md space-y-1 overflow-y-auto custom-scrollbar">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 font-label-md text-label-md transition-all duration-200 ease-in-out rounded-lg ${
                  isActive
                    ? 'border-l-4 border-primary bg-white/10 text-primary-fixed font-bold'
                    : 'text-secondary-fixed-dim/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
        <div className="p-md border-t border-white/10">
          <button
            onClick={() => signOut().then(() => router.push('/login'))}
            className="flex items-center gap-3 px-4 py-3 text-secondary-fixed-dim/70 hover:bg-danger/10 hover:text-danger w-full rounded-lg transition-all font-label-md text-label-md text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <div className="ml-72 flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="h-16 px-lg bg-surface flex justify-between items-center border-b border-outline-variant sticky top-0 z-40">
          <div className="flex items-center gap-md flex-1 max-w-xl">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary font-body-md text-body-md"
                placeholder="Search companies, employees, or document types..."
              />
            </div>
          </div>

          <div className="flex items-center gap-md">
            <div className="flex items-center gap-3 text-on-surface-variant border-l border-outline-variant pl-md ml-md">
              <button className="p-2 hover:bg-surface-container rounded-full transition-colors relative">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-surface"></span>
              </button>
              
              <div className="flex items-center gap-2 pl-2">
                <div className="h-8 w-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-sm">
                  {profile?.name ? profile.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="flex flex-col hidden md:flex text-left">
                  <span className="text-xs font-bold leading-none text-on-surface">{profile?.name || 'Admin'}</span>
                  <span className="text-[10px] text-on-surface-variant">{profile?.email || user.email}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Workspace content area */}
        <main className="flex-1 p-lg overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
