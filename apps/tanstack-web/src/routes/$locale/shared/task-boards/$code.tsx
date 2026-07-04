import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getPublicTaskBoard,
  InternalApiError,
  type PublicTaskBoardPayload,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { PublicTaskBoardContent } from '../../../../components/shared/public-task-board-content';
import { createPageHead } from '../../../../lib/platform/head';
import type { Locale } from '../../../../lib/platform/locale';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';

type PublicTaskBoardRouteParams = {
  code: string;
  locale: string;
};

type PublicTaskBoardPageResult =
  | {
      status: 200;
      data: PublicTaskBoardPayload;
    }
  | { status: 404; data: null };

const loadPublicTaskBoard = createServerFn({ method: 'GET' })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<PublicTaskBoardPageResult> => {
    const code = data.code.trim();

    if (!code) {
      return { status: 404, data: null };
    }

    try {
      const payload = await getPublicTaskBoard(
        code,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return { status: 200, data: payload };
    } catch (error) {
      if (error instanceof InternalApiError && error.status === 404) {
        return { status: 404, data: null };
      }

      throw error;
    }
  });

type PublicTaskBoardLoaderData =
  | {
      status: 'ok';
      payload: PublicTaskBoardPayload;
    }
  | { status: 'unavailable' };

const messagesByLocale: Record<
  Locale,
  { description: string; title: string; unavailableTitle: string }
> = {
  en: {
    title: 'Public task board',
    description: 'View this shared Tuturuuu task board.',
    unavailableTitle: 'Public board not found',
  },
  vi: {
    title: 'Bảng công việc công khai',
    description: 'Xem bảng công việc Tuturuuu được chia sẻ này.',
    unavailableTitle: 'Không tìm thấy bảng công khai',
  },
};

export const Route = createFileRoute('/$locale/shared/task-boards/$code')({
  component: PublicTaskBoardRoutePage,
  head: ({ loaderData, params }) => {
    const { locale: routeLocale } = params as PublicTaskBoardRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const messages = messagesByLocale[locale];
    const data = loaderData as PublicTaskBoardLoaderData | undefined;
    const title =
      data?.status === 'ok' && data.payload.board.name
        ? data.payload.board.name
        : messages.title;

    return createPageHead({
      locale,
      description: messages.description,
      robots: 'noindex, nofollow',
      title,
    });
  },
  loader: async ({ params }): Promise<PublicTaskBoardLoaderData> => {
    const { code = '' } = params as Partial<PublicTaskBoardRouteParams>;
    const result = await loadPublicTaskBoard({ data: { code } });

    if (result.status !== 200) {
      return { status: 'unavailable' };
    }

    return { status: 'ok', payload: result.data };
  },
});

function UnavailableShell({ locale }: { locale: Locale }) {
  const messages = messagesByLocale[locale];

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-2 font-semibold text-2xl text-dynamic-red">
          {messages.unavailableTitle}
        </h1>
        <p className="text-muted-foreground">{messages.description}</p>
      </div>
    </div>
  );
}

function PublicTaskBoardRoutePage() {
  const { locale } = Route.useParams() as PublicTaskBoardRouteParams;
  const data = Route.useLoaderData() as PublicTaskBoardLoaderData;
  const messagesLocale = resolveMessagesLocale(locale);

  if (data.status !== 'ok') {
    return <UnavailableShell locale={messagesLocale} />;
  }

  return <PublicTaskBoardContent payload={data.payload} />;
}
