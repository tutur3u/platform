import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  canAccessAiChatConversation,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  fetchChatLinkPreview,
  normalizeChatPreviewUrl,
} from '@/lib/chat/link-preview';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

type LinkPreviewRow = {
  description: string | null;
  error: string | null;
  failed_at: string | null;
  fetched_at: string;
  image_url: string | null;
  normalized_url: string;
  site_name: string | null;
  title: string | null;
  url: string;
};

type PrivateTableClient = {
  from: (table: 'chat_link_previews') => {
    select: (columns: string) => {
      in: (
        column: 'normalized_url',
        values: string[]
      ) => Promise<{ data: LinkPreviewRow[] | null; error: unknown }>;
    };
    upsert: (
      row: Partial<LinkPreviewRow>,
      options: { onConflict: string }
    ) => Promise<{ error: unknown }>;
  };
};

const previewSchema = z.object({
  urls: z.array(z.string().trim().url()).min(1).max(5),
});

export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = previewSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const normalizedUrls = Array.from(
      new Set(
        parsed.data.urls.flatMap((url) => {
          try {
            return [normalizeChatPreviewUrl(url)];
          } catch {
            return [];
          }
        })
      )
    );

    if (normalizedUrls.length === 0) {
      return NextResponse.json({ previews: [] });
    }

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const canAccess = await canAccessAiChatConversation({
          conversationId: params.conversationId,
          supabase: auth.supabase,
          userId: auth.user.id,
        });

        if (!canAccess) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }
      } else {
        await callPrivateChatRpc('chat_get_conversation', {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        });
      }

      const privateDb = getPrivateTableClient(
        await createAdminClient({ noCookie: true })
      );
      const existing = await privateDb
        .from('chat_link_previews')
        .select(
          'normalized_url,url,title,description,image_url,site_name,fetched_at,failed_at,error'
        )
        .in('normalized_url', normalizedUrls);

      if (existing.error) {
        throw existing.error;
      }

      const previews = new Map(
        (existing.data ?? []).map((row) => [row.normalized_url, row])
      );

      for (const normalizedUrl of normalizedUrls) {
        if (previews.has(normalizedUrl)) continue;

        try {
          const preview = await fetchChatLinkPreview(normalizedUrl);
          const row: LinkPreviewRow = {
            description: preview.description,
            error: null,
            failed_at: null,
            fetched_at: new Date().toISOString(),
            image_url: preview.imageUrl,
            normalized_url: normalizedUrl,
            site_name: preview.siteName,
            title: preview.title,
            url: preview.url,
          };

          await privateDb
            .from('chat_link_previews')
            .upsert(row, { onConflict: 'normalized_url' });
          previews.set(normalizedUrl, row);
        } catch (error) {
          const row: LinkPreviewRow = {
            description: null,
            error: error instanceof Error ? error.message : 'preview_failed',
            failed_at: new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            image_url: null,
            normalized_url: normalizedUrl,
            site_name: null,
            title: null,
            url: normalizedUrl,
          };

          await privateDb
            .from('chat_link_previews')
            .upsert(row, { onConflict: 'normalized_url' });
          previews.set(normalizedUrl, row);
        }
      }

      return NextResponse.json({
        previews: normalizedUrls.map((url) =>
          toPreviewPayload(previews.get(url)!)
        ),
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load link previews');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

function getPrivateTableClient(sbAdmin: unknown) {
  return (
    typeof sbAdmin === 'object' && sbAdmin !== null && 'schema' in sbAdmin
      ? (
          sbAdmin as {
            schema: (schema: 'private') => PrivateTableClient;
          }
        ).schema('private')
      : sbAdmin
  ) as PrivateTableClient;
}

function toPreviewPayload(row: LinkPreviewRow) {
  return {
    description: row.description,
    error: row.error,
    imageUrl: row.image_url,
    siteName: row.site_name,
    title: row.title,
    url: row.url,
  };
}
