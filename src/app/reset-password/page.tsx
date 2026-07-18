'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const handleAuth = async () => {
      console.log('Reset page URL:', window.location.href);

      const { data, error } = await supabase.auth.getSession();
      console.log('Initial session:', data.session);
      console.log('Initial session error:', error);

      if (!mounted) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        setSessionReady(true);
        setLoading(false);
        return;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth event:', event);
        console.log('Auth session:', session);

        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          setSessionReady(true);
          setLoading(false);
          setError('');
          return;
        }

        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          setSessionReady(true);
          setLoading(false);
          setError('');
          return;
        }
      });

      const timeout = setTimeout(() => {
        if (!mounted) return;
        setLoading(false);
        setError('Invalid or expired password reset link. Please request a new one.');
      }, 6000);

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    };

    let cleanup: void | (() => void) = undefined;

    handleAuth().then((fn) => {
      cleanup = fn;
    });

    return () => {
      mounted = false;
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number';
    if (!/[^A-Za-z0-9]/.test(pwd)) return 'Password must contain at least one special character';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!sessionReady) {
      setError('Reset session is not ready yet. Please wait a moment and try again.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      console.log('Password updated:', data);
      setSuccess('Password updated successfully. Redirecting to login...');

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      console.error('Password update error:', err);
      setError(err?.message || 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f5f5f0] to-[#e8ecde] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#316342] rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-2xl">PR</span>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-[#2b2b26] mb-2">
            Reset Password
          </h1>
          <p className="text-center text-[#8a8a80] mb-8">
            Create a new password for your account
          </p>

          {loading && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">Verifying reset link...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          {!loading && !sessionReady && !error ? (
            <div className="text-center">
              <p className="text-red-600 mb-4">Invalid or expired reset link</p>
              <p className="text-sm text-[#8a8a80]">
                Please request a new password reset link from the app.
              </p>
            </div>
          ) : (
            sessionReady && (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-[#2b2b26] mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-[#e8ecde] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#316342]"
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                  <p className="mt-1 text-xs text-[#8a8a80]">
                    Must be 8+ characters with uppercase, lowercase, number, and special character
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2b2b26] mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-[#e8ecde] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#316342]"
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[#316342] text-white rounded-lg font-semibold hover:bg-[#3d4a2a] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            )
          )}
        </div>

        <p className="text-center text-sm text-[#8a8a80] mt-6">
          © 2024 PRO Services. All rights reserved.
        </p>
      </div>
    </div>
  );
}
