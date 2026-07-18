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
  const [code, setCode] = useState<string | null>(null);
  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);

  useEffect(() => {
    // Extract code and code_verifier from URL
    // Supabase PKCE flow includes both in the reset URL
    let extractedCode: string | null = null;
    let extractedCodeVerifier: string | null = null;
    
    console.log('Full URL:', window.location.href);
    console.log('Search params:', window.location.search);
    console.log('Hash:', window.location.hash);
    
    // Check query parameters first
    const urlParams = new URLSearchParams(window.location.search);
    extractedCode = urlParams.get('code');
    extractedCodeVerifier = urlParams.get('code_verifier');
    
    // If not in query params, check hash fragment
    if (!extractedCode && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      extractedCode = hashParams.get('code');
      extractedCodeVerifier = hashParams.get('code_verifier');
    }
    
    console.log('Parsed code:', extractedCode);
    console.log('Parsed code_verifier:', extractedCodeVerifier);
    
    if (extractedCode) {
      setCode(extractedCode);
      setCodeVerifier(extractedCodeVerifier);
    } else {
      setError('Invalid or expired reset link. Please request a new password reset link from the app.');
    }
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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      // Use official Supabase PKCE flow
      // The code_verifier is required for PKCE authentication
      console.log('Exchanging code for session with PKCE...');
      
      if (!code) {
        throw new Error('Missing reset code');
      }

      // Exchange the authorization code for a session
      // This requires the code_verifier from the URL
      const { data: exchangeData, error: exchangeError } = 
        await supabase.auth.exchangeCodeForSession(code, codeVerifier || undefined);
      
      if (exchangeError) {
        console.error('Session error:', exchangeError);
        throw new Error(exchangeError.message || 'Invalid or expired reset link');
      }

      console.log('Session created successfully');

      // Update the password using the established session
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Password updated successfully');
      setSuccess('Password updated successfully! Redirecting to login...');
      
      // Sign out and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      console.error('Error:', err);
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

          {!code ? (
            <div className="text-center">
              <p className="text-red-600 mb-4">Invalid or expired reset link</p>
              <p className="text-sm text-[#8a8a80] mb-4">
                Please request a new password reset link from the app.
              </p>
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
