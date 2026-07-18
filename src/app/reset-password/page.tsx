'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Extract token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('token');
    const type = urlParams.get('type');
    
    if (accessToken && type === 'recovery') {
      setToken(accessToken);
    } else {
      setError('Invalid or expired reset link');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      // Set the session with the recovery token
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: token!,
        refresh_token: token!,
      });

      if (sessionError) {
        throw sessionError;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess('Password updated successfully! Redirecting to login...');
      
      // Sign out and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f5f5f0] to-[#e8ecde] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
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

          {!token ? (
            <div className="text-center">
              <p className="text-red-600">Invalid or expired reset link</p>
              <button
                onClick={() => router.push('/login')}
                className="mt-4 px-6 py-2 bg-[#316342] text-white rounded-lg hover:bg-[#3d4a2a] transition-colors"
              >
                Go to Login
              </button>
            </div>
          ) : (
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
                disabled={loading}
                className="w-full py-3 bg-[#316342] text-white rounded-lg font-semibold hover:bg-[#3d4a2a] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#8a8a80] mt-6">
          © 2024 PRO Services. All rights reserved.
        </p>
      </div>
    </div>
  );
}