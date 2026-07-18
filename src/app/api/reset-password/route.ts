import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reset-password
 *
 * Handles password reset using the PKCE code from the reset email.
 * Uses Supabase Admin API to exchange the code and update the password.
 *
 * Body:
 *   - code: string (the PKCE code from URL)
 *   - password: string (new password)
 */
export async function POST(request: NextRequest) {
  try {
    const { code, password } = await request.json();

    if (!code || !password) {
      return NextResponse.json(
        { error: 'Code and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }
    if (!/[a-z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one lowercase letter' },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 }
      );
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one special character' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[reset-password] Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Exchange the code for a session using admin API
    // This bypasses the PKCE code verifier requirement
    const { data: exchangeData, error: exchangeError } = 
      await supabaseAdmin.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[reset-password] Exchange error:', exchangeError);
      
      // Handle specific PKCE errors
      if (exchangeError.message?.includes('code verifier')) {
        return NextResponse.json(
          { error: 'Invalid or expired reset link. Please request a new password reset link from the app.' },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: exchangeError.message || 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    if (!exchangeData.user) {
      return NextResponse.json(
        { error: 'Failed to create session from reset code' },
        { status: 400 }
      );
    }

    // Update the user's password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      exchangeData.user.id,
      { password: password }
    );

    if (updateError) {
      console.error('[reset-password] Update error:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update password' },
        { status: 400 }
      );
    }

    // Sign out the user from all sessions (optional security measure)
    await supabaseAdmin.auth.admin.signOut(exchangeData.user.id);

    console.log('[reset-password] Password updated successfully for user:', exchangeData.user.id);

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (err: any) {
    console.error('[reset-password] Error:', err);
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}