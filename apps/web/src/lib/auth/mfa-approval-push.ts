import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { sendCustomPushMessageBatch } from '@/lib/notifications/push-delivery';

/** A push is only a wake-up hint. Never include a code, session or secret. */
export async function sendMfaApprovalPush(input: {
  userId: string;
  challengeId: string;
  expiresAt: string;
  locale?: string;
}) {
  try {
    const admin = await createAdminClient();
    const { data: devices, error } = await admin
      .from('notification_push_devices')
      .select('token')
      .eq('user_id', input.userId)
      .eq('app_flavor', 'production')
      .limit(100);
    if (error) throw new Error('Unable to load approval notification devices');
    if (!devices?.length) return;
    const vietnamese = input.locale === 'vi';
    const result = await sendCustomPushMessageBatch({
      devices,
      message: {
        title: vietnamese
          ? 'Yêu cầu đăng nhập Tuturuuu'
          : 'Tuturuuu sign-in request',
        body: vietnamese
          ? 'Chạm để xem và xác minh. Chỉ phê duyệt yêu cầu do bạn tạo.'
          : 'Tap to review and verify. Only approve a sign-in you started.',
        expiresAt: input.expiresAt,
        category: 'tuturuuu_login_approval',
        data: {
          openTarget: 'mfa_approval',
          entityId: input.challengeId,
          userId: input.userId,
          expiresAt: input.expiresAt,
        },
      },
    });
    if (result.invalidTokens.length) {
      await admin
        .from('notification_push_devices')
        .delete()
        .eq('user_id', input.userId)
        .in('token', result.invalidTokens);
    }
  } catch {
    // An unavailable push provider must not prevent code entry or polling.
    console.warn('Mobile MFA approval notification could not be delivered', {
      challengeId: input.challengeId,
    });
  }
}
