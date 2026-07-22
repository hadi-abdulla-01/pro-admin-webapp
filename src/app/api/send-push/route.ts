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

    const { notification_id, company_id, title, message, idempotency_key } =
      await request.json();

    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
    }

    // Generate idempotency key if not provided (based on notification_id + timestamp rounded to 10s)
    const effectiveIdempotencyKey = idempotency_key || 
      `${notification_id}_${Math.floor(Date.now() / 10000)}`;

    // COMPREHENSIVE DUPLICATE PREVENTION - MULTIPLE LAYERS
    
    // Layer 0: Atomic idempotency check (most reliable - prevents concurrent duplicate submissions)
    const { data: existingIdempotent, error: idempotentError } = await supabaseAdmin
      .from('notification_deliveries')
      .select('id')
      .eq('idempotency_key', effectiveIdempotencyKey)
      .maybeSingle();

    if (!idempotentError && existingIdempotent) {
      console.log(`[send-push] ❌ IDEMPOTENCY BLOCKED: Duplicate request with key ${effectiveIdempotencyKey}`);
      return NextResponse.json({ 
        skipped: true, 
        reason: 'already_processed',
        message: 'Duplicate notification prevented by idempotency key'
      });
    }

    // Layer 1: Check if notification was already processed (database level)
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('notification_deliveries')
      .select('id, processed_at')
      .eq('notification_id', notification_id)
      .maybeSingle();

    if (checkError) {
      const error = checkError as Error;
      if (!error.message.includes('relation "notification_deliveries" does not exist')) {
        console.error('[send-push] Error checking for duplicates:', error);
      }
    } else if (existing) {
      const processedAt = new Date(existing.processed_at);
      const now = new Date();
      const minutesSinceProcessed = (now.getTime() - processedAt.getTime()) / (1000 * 60);
      
      if (minutesSinceProcessed < 5) {
        console.log(`[send-push] ❌ DUPLICATE BLOCKED: Notification ${notification_id} already processed ${minutesSinceProcessed.toFixed(1)} minutes ago`);
        return NextResponse.json({ 
          skipped: true, 
          reason: 'already_processed',
          message: `Duplicate notification prevented - processed ${minutesSinceProcessed.toFixed(1)} minutes ago`
        });
      } else {
        console.log(`[send-push] ⚠️  RETRY DETECTED: Notification ${notification_id} was processed ${minutesSinceProcessed.toFixed(1)} minutes ago, allowing retry`);
      }
    }
    
    // Layer 2: Check for in-progress notifications (recent duplicates within 3 minutes)
    const recentCutoff = new Date(Date.now() - 3 * 60 * 1000);
    const { data: recentNotifications, error: recentError } = await supabaseAdmin
      .from('notification_deliveries')
      .select('notification_id')
      .gte('processed_at', recentCutoff.toISOString())
      .eq('notification_id', notification_id);
    
    if (recentNotifications && recentNotifications.length > 0) {
      console.log(`[send-push] ❌ RECENT DUPLICATE BLOCKED: Notification ${notification_id} found in recent deliveries`);
      return NextResponse.json({ 
        skipped: true,
        reason: 'recent_duplicate',
        message: 'Duplicate notification prevented - found in recent delivery history'
      });
    }

    // Determine which users to notify
    let query = supabaseAdmin
      .from('users')
      .select('id, fcm_token')
      .not('fcm_token', 'is', null);

    if (company_id) {
      // Check if this company belongs to a group
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('group_id')
        .eq('id', company_id)
        .single();

      if (companyData?.group_id) {
        // Company belongs to a group - target all users in that group
        query = query.eq('group_id', companyData.group_id);
        console.log(`[send-push] Company ${company_id} belongs to group ${companyData.group_id} - targeting all group users`);
      } else {
        // Standalone company - target users with this company_id
        query = query.eq('company_id', company_id);
      }
    }

    const { data: users, error: userError } = await query;

    if (userError) {
      console.error('[send-push] Error fetching users:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'no_tokens' });
    }

    console.log(`[NOTIFICATION_FLOW] 🔍 Backend processing notification ${notification_id} for ${users.length} users`);

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
    console.log(`[NOTIFICATION_FLOW] 🧹 Token deduplication: ${totalTokensBeforeDedup} tokens → ${tokens.length} unique users`);

    // Additional deduplication: remove duplicate tokens (same token for different users)
    const uniqueTokens = [...new Set(tokens)];
    if (uniqueTokens.length < tokens.length) {
      console.log(`[NOTIFICATION_FLOW] 🗑️  Removed ${tokens.length - uniqueTokens.length} duplicate tokens`);
    }

    if (uniqueTokens.length === 0) {
      console.log(`[NOTIFICATION_FLOW] ⚠️  No valid tokens found`);
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

    console.log(`[NOTIFICATION_FLOW] 📤 Sending to ${uniqueTokens.length} unique devices`);
    console.time(`[NOTIFICATION_FLOW] FCM batch for ${notification_id}`);

    for (const token of uniqueTokens) {
      // FCM payload includes BOTH `notification` AND `data` blocks.
      //
      // Why both? When the app is killed, Android's FCM service auto-displays
      // the `notification` block as a system notification (this is the ONLY way
      // to reliably show notifications on a killed app).
      //
      // The background handler (main.dart) checks for the `notification` block:
      // if present, it SKIPS showing a local notification to avoid double display.
      // If absent (data-only), it falls back to showing a local notification.
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
            title: title ?? 'PRO Services',
            body: message ?? '',
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
          console.log(`[NOTIFICATION_FLOW] ✅ FCM success for token ${token.slice(0, 16)}...`);
        } else {
          const errBody = await res.text();
          const errMsg = `FCM error for token ${token.slice(0, 16)}...: ${errBody}`;
          console.error(`[NOTIFICATION_FLOW] ❌ ${errMsg}`);
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
    
    console.timeEnd(`[NOTIFICATION_FLOW] FCM batch for ${notification_id}`);
    console.log(`[NOTIFICATION_FLOW] 📊 FCM completed: ${sent} sent, ${failed} failed, ${uniqueTokens.length} total`);

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
            idempotency_key: effectiveIdempotencyKey,
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
                idempotency_key: effectiveIdempotencyKey,
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