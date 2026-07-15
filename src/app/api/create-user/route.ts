import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { p_email, p_password, p_name, p_role, p_company_id } = await request.json();

    if (!p_email || !p_password || !p_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Step 1: Create the user in GoTrue via Admin API (proper way)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: p_email,
      password: p_password,
      email_confirm: true, // auto-confirm email
      user_metadata: {
        name: p_name,
        role: p_role,
        company_id: p_company_id || null,
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // Step 2: Resolve role_id from public.roles
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', p_role)
      .single();

    if (roleError || !roleData) {
      return NextResponse.json({ error: 'Role not found' }, { status: 400 });
    }

    // Step 3: Upsert into public.users (trigger may have already created it)
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        name: p_name,
        email: p_email,
        role_id: roleData.id,
        company_id: p_role === 'client' && p_company_id ? p_company_id : null,
        status: 'active',
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      // Don't fail — the trigger may have handled it
    }

    return NextResponse.json({ id: userId }, { status: 200 });
  } catch (err: any) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
