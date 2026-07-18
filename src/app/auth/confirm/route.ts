import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { type EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (!token_hash || !type) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        'Missing recovery token.'
      )}`
    );
  }

  // Prevent CDN caching or browser prefetch from consuming the one-time token
  // on a "background" request before the user's actual navigation arrives.
  // This header tells every intermediary: do not cache, do not store.

  const cookieStore = await cookies();

  // Collect cookies written by Supabase during verifyOtp so we can apply
  // them to whichever response we end up returning (success or error).
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Buffer cookies — we'll apply them after we know the outcome.
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, options: options as Record<string, unknown> });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  console.log('verifyOtp result:', { data, error });

  if (error) {
    console.error('verifyOtp failed:', error);
    // Single-use token was already consumed, or the link genuinely expired.
    const errResponse = NextResponse.redirect(`${origin}/reset-link-expired`);
    errResponse.headers.set('Cache-Control', 'no-store');
    return errResponse;
  }

  // Build the success response only after we know verifyOtp succeeded,
  // then attach the session cookies Supabase wrote during the call.
  const response = NextResponse.redirect(`${origin}${next}`);
  response.headers.set('Cache-Control', 'no-store');

  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  console.log('verifyOtp succeeded');
  console.log('Cookies being returned:', response.cookies.getAll());

  return response;
}
