import { createClient } from '@tuturuuu/supabase/next/server';
import { getRateLimiters } from '@tuturuuu/utils/api-proxy-rate-limiters';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { hasOversizedDeclaredContentLength } from './input';

/**
 * Legacy stored-recording transcription is permanently refused.
 *
 * Legacy recordings carry no trusted speaker provenance, so per-speaker
 * consent can never be verified for them. There is deliberately no flag,
 * workspace config or injected option that re-enables this path: a workspace
 * settings manager's opt-in is not speaker consent, and any workspace config
 * key is writable by settings managers through the generic settings API and
 * RLS. Meet AI is the consented transcription path.
 */
export const LEGACY_MEETING_TRANSCRIPTION_DISABLED_CODE =
  'LEGACY_MEETING_TRANSCRIPTION_DISABLED';

const LEGACY_REFUSAL_MESSAGES = {
  en: 'Speaker consent cannot be verified for legacy recordings. Use Meet AI.',
  vi: 'Không thể xác minh sự đồng ý của người nói cho bản ghi cũ. Hãy sử dụng Meet AI.',
} as const;

const RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;

function legacyTranscriptionRefusal(req: Request) {
  const locale = req.headers
    .get('accept-language')
    ?.trim()
    .toLowerCase()
    .startsWith('vi')
    ? 'vi'
    : 'en';
  return Response.json(
    {
      code: LEGACY_MEETING_TRANSCRIPTION_DISABLED_CODE,
      error: LEGACY_REFUSAL_MESSAGES[locale],
    },
    { status: 403 }
  );
}

export function createPOST() {
  return async function handler(req: Request) {
    try {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (hasOversizedDeclaredContentLength(req)) {
        return new Response('Audio file too large', { status: 413 });
      }

      // Fail closed: a missing or erroring limiter store must not skip the
      // limit in front of the membership and meeting lookups.
      let limiters: Awaited<ReturnType<typeof getRateLimiters>>;
      try {
        limiters = await getRateLimiters('ai:meeting-transcription', {
          get: [],
          mutate: [{ duration: '1 m', limit: 10, window: 'minute' }],
        });
      } catch {
        limiters = null;
      }
      const buckets = limiters?.mutate ?? [];
      const rateLimitUnavailable = () => {
        console.error('Meeting transcription rate limiter unavailable');
        return new Response('Service temporarily unavailable', {
          status: 503,
          headers: {
            'Retry-After': String(RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS),
          },
        });
      };
      if (buckets.length === 0) return rateLimitUnavailable();
      for (const { limiter } of buckets) {
        let result: Awaited<ReturnType<typeof limiter.limit>>;
        try {
          result = await limiter.limit(user.id);
        } catch {
          return rateLimitUnavailable();
        }
        if (!result.success) {
          return new Response('Too many requests', {
            status: 429,
            headers: {
              'Retry-After': String(
                Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
              ),
            },
          });
        }
      }

      const formData = await req.formData();
      const rawWsId = formData.get('wsId');
      if (typeof rawWsId !== 'string' || !rawWsId.trim()) {
        return new Response('Workspace ID is required', { status: 400 });
      }

      let wsId: string;
      try {
        wsId = await normalizeWorkspaceId(rawWsId.trim(), supabase);
      } catch {
        return new Response('Workspace access denied', { status: 403 });
      }
      if (!z.uuid().safeParse(wsId).success) {
        return new Response('Workspace access denied', { status: 403 });
      }
      const meetingId = formData.get('meetingId');
      if (
        !z.uuid().safeParse(meetingId).success ||
        typeof meetingId !== 'string'
      ) {
        return new Response('Meeting ID is required', { status: 400 });
      }

      // Membership first, then a meeting lookup scoped to that workspace, so
      // an outsider learns nothing about meetings in other workspaces.
      const membership = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase,
        requiredType: 'MEMBER',
      });
      if (!membership.ok) {
        return new Response('Workspace access denied', { status: 403 });
      }

      const { data: meeting, error: meetingError } = await supabase
        .from('workspace_meetings')
        .select('id')
        .eq('id', meetingId)
        .eq('ws_id', wsId)
        .maybeSingle();
      if (meetingError) {
        return new Response('Meeting lookup unavailable', { status: 503 });
      }
      if (!meeting) {
        return new Response('Meeting access denied', { status: 403 });
      }

      // Always refused: no audio read, usage charge, credit check or provider
      // call happens on this route.
      return legacyTranscriptionRefusal(req);
    } catch (error) {
      console.error('Transcription error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  };
}
