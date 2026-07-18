'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      console.log('=== RESET PAGE ===');

      const sessionResult = await supabase.auth.getSession();
      console.log('getSession:', sessionResult);

      const userResult = await supabase.auth.getUser();
      console.log('getUser:', userResult);

      if (!mounted) return;

      const session = sessionResult.data.session;

      if (session) {
        console.log('Session found!');
        setSessionReady(true);
        setLoading(false);
        return;
      }

      console.log('No session found');

      setError(
        'Invalid or expired password reset link. Please request a new one.'
      );
      setLoading(false);
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8)
      return 'Password must be at least 8 characters';

    if (!/[A-Z]/.test(pwd))
      return 'Password must contain at least one uppercase letter';

    if (!/[a-z]/.test(pwd))
      return 'Password must contain at least one lowercase letter';

    if (!/[0-9]/.test(pwd))
      return 'Password must contain at least one number';

    if (!/[^A-Za-z0-9]/.test(pwd))
      return 'Password must contain at least one special character';

    return null;
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!sessionReady) {
      setError(
        'Reset session is not ready yet. Please wait a moment and try again.'
      );
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
      const { data, error } =
        await supabase.auth.updateUser({
          password,
        });

      if (error) throw error;

      console.log('Password updated:', data);

      setSuccess(
        'Password updated successfully! You can now close this page and sign in from the PRO mobile app with your new password.'
      );

      await supabase.auth.signOut();

      setSessionReady(false);

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
              <span className="text-white font-bold text-2xl">
                PR
              </span>
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
              <p className="text-blue-700 text-sm">
                Verifying reset link...
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">
                {error}
              </p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 text-sm">
                {success}
              </p>
            </div>
          )}

                    {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✅</span>
              </div>

              <h2 className="text-2xl font-bold text-[#316342] mb-3">
                Password Updated
              </h2>

              <p className="text-[#666] mb-6">
                Your password has been changed successfully.
              </p>

              <div className="bg-[#f5f5f0] rounded-lg p-4">
                <p className="text-sm text-[#444]">
                  You can now close this page and return to the <strong>PRO mobile app</strong>,
                  then sign in using your new password.
                </p>
              </div>
            </div>
          ) : !loading && !sessionReady && !error ? (
            <div className="text-center">
              <p className="text-red-600 mb-4">
                Invalid or expired reset link
              </p>

              <p className="text-sm text-[#8a8a80]">
                This password reset link has expired or has already been used.
              </p>

              <p className="text-sm text-[#8a8a80] mt-2">
                Please request a new password reset email from the PRO mobile app.
              </p>
            </div>
          ) : (
            sessionReady && (
              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div>
                  <label className="block text-sm font-semibold text-[#2b2b26] mb-2">
                    New Password
                  </label>

                  <input
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    className="w-full px-4 py-3 border border-[#e8ecde] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#316342]"
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />

                  <p className="mt-1 text-xs text-[#8a8a80]">
                    Must be at least 8 characters and contain uppercase,
                    lowercase, number and special character.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2b2b26] mb-2">
                    Confirm New Password
                  </label>

                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(e.target.value)
                    }
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
                  {submitting
                    ? 'Updating...'
                    : 'Update Password'}
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
