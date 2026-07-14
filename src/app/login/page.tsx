'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers';

const loginSchema = zod.object({
  email: zod.string().email({ message: 'Invalid email address' }),
  password: zod.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFields = zod.infer<typeof loginSchema>;

function LoginForm() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (profile && profile.roles?.name === 'admin') {
        router.push('/');
      } else if (profile && profile.roles?.name !== 'admin') {
        setErrorMsg('Unauthorized: Only administrators are allowed to access this portal.');
      }
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      setErrorMsg('You do not have administrative privileges to access this page.');
    }
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFields) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        setErrorMsg(authError.message);
        setIsSubmitting(false);
        return;
      }

      if (authData.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*, roles(name)')
          .eq('id', authData.user.id)
          .single();

        if (profileError || !profileData || profileData.roles?.name !== 'admin') {
          setErrorMsg('Access Denied: Admin role verification failed.');
          await supabase.auth.signOut();
        } else {
          router.push('/');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An error occurred during login. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle p-6">
      <div className="w-full max-w-md bg-white border border-border-subtle rounded-2xl shadow-xl overflow-hidden p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center text-white font-black text-2xl mb-4">
            PRO
          </div>
          <h1 className="text-headline-lg font-bold text-on-surface">Admin Portal</h1>
          <p className="text-body-sm text-on-surface-variant">UAE PRO Services Management Panel</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-danger/10 border-l-4 border-danger text-danger text-body-sm rounded-r-lg">
            <span className="font-bold">Error: </span>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-2" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.email ? 'border-danger focus:ring-danger' : 'border-border-subtle'
              }`}
              placeholder="admin@proportal.ae"
              {...register('email')}
            />
            {errors.email && <p className="mt-1.5 text-danger text-[11px] font-medium">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-label-md text-on-surface-variant mb-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.password ? 'border-danger focus:ring-danger' : 'border-border-subtle'
              }`}
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              {...register('password')}
            />
            {errors.password && <p className="mt-1.5 text-danger text-[11px] font-medium">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-primary text-white rounded-lg font-bold hover:brightness-110 disabled:bg-primary/50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                <span>Authenticating...</span>
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
