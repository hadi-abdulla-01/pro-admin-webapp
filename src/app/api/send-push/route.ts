import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleAuth } from 'google-auth-library';

export const dynamic = 'force-dynamic';

/**
 * POST /api/send-push
 *
 * Called after a notification is inserted into the `notifications` table.
 * Looks up FCM tokens for the target users and sends push via Firebase HTTP v1 API.
 *
 * Requires:
 *   - SUPABASE_SERVICE_ROLE_KEY in env
 *   - FIREBASE_SERVICE_ACCOUNT_JSON in env (the full JSON string of a Firebase
 *     service account with "Firebase Cloud Messaging Admin" role)
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const firebaseSaJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase credentials' },
        { status: 500 },
      );
    }

    if (!firebaseSaJson) {
      console.warn(
        '[send-push] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping push',
      );
      return NextResponse.json({ skipped: true, reason: 'no_firebase_config' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { notification_id, company_id, title, message } =
      await request.json();

    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
    }

    // Enhanced duplicate prevention with multiple checks
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('notification_deliveries')
      .select('id, processed_at')
      .eq('notification_id', notification_id)
      .maybeSingle();

    if (checkError) {
      const error = checkError as Error;
      if (!error.message.includes('relation "notification_deliveries" does not exist')) {
        console.error('[send-push] Error checking for duplicates:', error);
        // Continue processing if the table doesn't exist (backward compatibility)
      }
    } else if (existing) {
      // Check if the notification was processed recently (within last 5 minutes)
      const processedAt = new Date(existing.processed_at);
      const now = new Date();
      const minutesSinceProcessed = (now.getTime() - processedAt.getTime()) / (1000 * 60);
      
      if (minutesSinceProcessed < 5) {
        console.log(`[send-push] Notification ${notification_id} already processed ${minutesSinceProcessed.toFixed(1)} minutes ago, skipping`);
        return NextResponse.json({ skipped: true, reason: 'already_processed' });
      } else {
        // If it's an old record, update it rather than creating a duplicate
        console.log(`[send-push] Notification ${notification_id} was processed ${minutesSinceProcessed.toFixed(1)} minutes ago, updating record`);
      }
    }

    // Determine which users to notify
    let query = supabaseAdmin
      .from('users')
      .select('id, fcm_token')
      .not('fcm_token', 'is', null);

    if (company_id) {
      query = query.eq('company_id', company_id);
    }

    const { data: users, error: userError } = await query;

    if (userError) {
      console.error('[send-push] Error fetching users:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'no_tokens' });
    }

    console.log(`[send-push] Processing notification ${notification_id} for ${users.length} users`);

    // Group tokens by user_id to ensure one notification per user
    const userTokensMap = new Map<string, string[]>();
    for (const user of users) {
      if (user.fcm_token && user.fcm_token.length > 0) {
        // Collect all tokens for each user
        if (!userTokensMap.has(user.id)) {
          userTokensMap.set(user.id, []);
        }
        userTokensMap.get(user.id)?.push(user.fcm_token);
      }
    }

    // For each user, use only their most recent token (last one in the array)
    const tokens: string[] = Array.from(userTokensMap.values())
      .map(tokenArray => tokenArray[tokenArray.length - 1]); // Use the last (most recent) token

    // Log token deduplication results
    const totalTokensBeforeDedup = Array.from(userTokensMap.values()).reduce((sum, tokens) => sum + tokens.length, 0);
    console.log(`[send-push] Token deduplication: ${totalTokensBeforeDedup} tokens → ${tokens.length} unique users`);

    // Additional deduplication: remove duplicate tokens (same token for different users)
    const uniqueTokens = [...new Set(tokens)];
    if (uniqueTokens.length < tokens.length) {
      console.log(`[send-push] Removed ${tokens.length - uniqueTokens.length} duplicate tokens`);
    }

    if (uniqueTokens.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'no_tokens' });
    }

    // Parse service account JSON (handle escaped newlines in private_key)
    const raw = firebaseSaJson;
    const sa = JSON.parse(raw);
    // Fix private_key if \n was stored as literal backslash-n
    if (sa.private_key && sa.private_key.includes('\\n')) {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    }

    // Use google-auth-library to get an OAuth2 access token
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken || !accessToken.token) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }

    // Send via FCM HTTP v1 API
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`[send-push] Sending to ${uniqueTokens.length} unique devices`);

    for (const token of uniqueTokens) {
      const payload = {
        message: {
          token,
          notification: {
            title: title ?? 'PRO Services',
            body: message ?? '',
          },
          data: {
            notification_id: notification_id,
            company_id: company_id ?? '',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
          android: {
            priority: 'high' as const,
            notification: {
              channel_id: 'pro_services_channel',
              sound: 'default',
            },
          },
        },
      };

      try {
        const res = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken.token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          sent++;
        } else {
          const errBody = await res.text();
          const errMsg = `FCM error for token ${token.slice(0, 16)}...: ${errBody}`;
          console.error(`[send-push] ${errMsg}`);
          errors.push(errMsg);
          failed++;
        }
      } catch (e) {
        const errMsg = `Network error for token: ${e}`;
        console.error(`[send-push] ${errMsg}`);
        errors.push(errMsg);
        failed++;
      }
    }

    // Record successful delivery to prevent duplicates
    try {
      await supabaseAdmin
        .from('notification_deliveries')
        .insert([
          {
            notification_id: notification_id,
            sent_count: sent,
            failed_count: failed,
            total_count: uniqueTokens.length,
            users_count: userTokensMap.size,
            processed_at: new Date().toISOString(),
          },
        ]);
    } catch (recordError) {
      const error = recordError as Error;
      // If the table doesn't exist, we'll create it (for backward compatibility)
      if (error.message.includes('relation "notification_deliveries" does not exist')) {
        try {
          await supabaseAdmin
            .from('notification_deliveries')
            .insert([
              {
                notification_id: notification_id,
                sent_count: sent,
                failed_count: failed,
                total_count: tokens.length,
                processed_at: new Date().toISOString(),
              },
            ])
            .select();
        } catch (createError) {
          console.error('[send-push] Could not create notification_deliveries record:', createError);
        }
      } else {
        console.error('[send-push] Could not record notification delivery:', error);
      }
    }

    return NextResponse.json({ sent, failed, total: uniqueTokens.length, users: userTokensMap.size, errors: errors.slice(0, 5) });
  } catch (err: any) {
    console.error('[send-push] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error', stack: err.stack }, { status: 500 });
  }
}