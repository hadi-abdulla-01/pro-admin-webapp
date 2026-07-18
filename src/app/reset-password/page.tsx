'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // true when we have a valid session or token to work with

  // Store what we parsed from the URL
  const [authMethod, setAuthMethod] = useState<'session' | 'token_hash' | 'code' | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const url = window.location.href;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    console.log('Reset password URL:', url);
    console.log('Hash params:', Object.fromEntries(hashParams.entries()));
    console.log('Search params:', Object.fromEntries(searchParams.entries()));

    // ─── Priority 1: Hash fragment or query params with access_token (Supabase implicit flow) ───
    // Supabase default email sends: #access_token=xxx&refresh_token=yyy&type=recovery
    // But sometimes tokens might be in query params depending on configuration
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
    const type = hashParams.get('type') || searchParams.get('type');

    if (accessToken && refreshToken && type === 'recovery') {
      console.log('Detected implicit flow with access_token');
      // Directly set the session using the tokens from the URL — no code_verifier needed
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessionError, data }) => {
          if (sessionError) {
            console.error('Session error:', sessionError);
            setError(`Session error: ${sessionError.message || 'Invalid tokens'}. Please request a new password reset link from the app.`);
          } else {
            console.log('Session set successfully via access_token, session:', data.session);
            setAuthMethod('session');
            setReady(true);
          }
        })
        .catch((err) => {
          console.error('Error setting session:', err);
          setError(`Failed to set session: ${err.message || err.toString()}. Please request a new link.`);
        });
      return;
    }

    // ─── Priority 2: token_hash query param (customized email template) ───
    const extractedTokenHash = searchParams.get('token_hash');
    if (extractedTokenHash && type === 'recovery') {
      console.log('Detected token_hash in query params');
      setTokenHash(extractedTokenHash);
      setAuthMethod('token_hash');
      setReady(true);
      return;
    }

    // ─── Priority 3: PKCE code in query param (ONLY for non-recovery flows) ───
    // For password reset (recovery), Supabase uses implicit flow with access_token in hash,
    // NOT PKCE with code. So we only use code path for non-recovery auth flows.
    const extractedCode = searchParams.get('code');
    if (extractedCode && type !== 'recovery') {
      console.log('Detected PKCE code in query params (non-recovery flow)');
      
      // Try to get code_verifier from URL params first, then sessionStorage
      const urlCodeVerifier = searchParams.get('code_verifier');
      const storedCodeVerifier = typeof window !== 'undefined' ? sessionStorage.getItem('supabase-code-verifier') : null;
      const verifier = urlCodeVerifier || storedCodeVerifier;
      
      if (verifier) {
        console.log('Found code_verifier');
        setCodeVerifier(verifier);
        setCode(extractedCode);
        setAuthMethod('code');
        setReady(true);
      } else {
        console.error('PKCE code found but no code_verifier - invalid auth flow');
        // Don't set as ready, will fall through to error below
      }
      return;
    }
    
    // Special case: If there's a code parameter with type=recovery, this is an invalid
    // password reset link. Supabase should send access_token in hash, not code.
    // This can happen with misconfigured email templates.
    if (extractedCode && type === 'recovery') {
      console.error('Invalid password reset link: received code parameter instead of access_token');
      console.error('URL should have #access_token=...&refresh_token=...&type=recovery');
      setError('Invalid password reset link. Please request a new link from the app. The link should open directly to the reset form without requiring additional verification.');
      return;
    }

    // Nothing valid found
    console.error('No valid reset token found in URL');
    setError('Invalid or expired reset link. Please request a new password reset link from the app.');
    // Set a timeout to prevent infinite loading
    timeoutRef.current = setTimeout(() => {
      if (!ready && !error) {
        console.error('Timeout: Reset link verification taking too long');
        setError('Reset link verification timed out. Please check the URL and try again.');
      }
    }, 10000); // 10 second timeout

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
      // ─── Establish session based on auth method ───
      if (authMethod === 'session') {
        // Session already set in useEffect via setSession() — nothing to do here
        console.log('Using pre-established session from access_token');
      } else if (authMethod === 'token_hash' && tokenHash) {
        // Verify OTP token hash (customized email template)
        console.log('Verifying token_hash...');
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (verifyError) {
          throw new Error(verifyError.message || 'Invalid or expired recovery token');
        }
      } else if (authMethod === 'code' && code) {
        // PKCE code exchange (only works if initiated in same browser)
        console.log('Exchanging PKCE code for session...');
        
        if (!codeVerifier) {
          throw new Error('Invalid reset link: missing code verifier. Please request a new password reset link from the app.');
        }
        
        // In Supabase JS v2, exchangeCodeForSession looks for code_verifier in sessionStorage
        // Set it with the expected key before calling the method
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('supabase-code-verifier', codeVerifier);
        }
        
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw new Error(exchangeError.message || 'Invalid or expired reset link. Try requesting a new link from the app.');
        }
      } else {
        throw new Error('No valid reset credentials found. Please request a new link from the app.');
      }

      // ─── Update the password ───
      console.log('Updating password...');
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update password');
      }

      console.log('Password updated successfully');
      setSuccess('Password updated successfully! You can now log in to the app with your new password.');

      // ─── Sign out recovery session and redirect to Flutter app ───
      setTimeout(async () => {
        await supabase.auth.signOut();
        // Redirect to Flutter app via deep link (proappadmin scheme)
        window.location.href = 'proappadmin://login';
      }, 2500);

    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to update password. Please request a new reset link.');
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

          {/* Show form only when we have a valid token/session and no success yet */}
          {!ready && !error && (
            <div className="text-center py-6">
              <div className="inline-block w-8 h-8 border-4 border-[#316342] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[#8a8a80] text-sm mt-3">Verifying reset link...</p>
            </div>
          )}

          {ready && !success && (
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
                  disabled={loading}
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
                  disabled={loading}
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

          {/* If error and no token, show link prompt */}
          {error && !ready && (
            <div className="text-center mt-4">
              <p className="text-sm text-[#8a8a80]">
                Open the PRO app and use &quot;Forgot Password&quot; to request a new link.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-[#8a8a80] mt-6">
          © 2024 PRO Services. All rights reserved.
        </p>
      </div>
    </div>
  );
}
