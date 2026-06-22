import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  DocumentPageContent,
  type PublicDocumentPreview,
} from '../../../components/documents/document-page-content';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';

const publicDocumentSelect = 'id,name,content,is_public,created_at';

type PublicDocumentRouteParams = {
  documentId: string;
  locale: string;
};

type PublicDocumentRow = Omit<PublicDocumentPreview, 'content'> & {
  content: PublicDocumentPreview['content'];
};

function getServerEnvValue(name: string) {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value || undefined;
}

function getSupabaseRestUrl() {
  const rawUrl =
    getServerEnvValue('SUPABASE_SERVER_URL') ??
    getServerEnvValue('SUPABASE_URL') ??
    getServerEnvValue('NEXT_PUBLIC_SUPABASE_URL');

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL('/rest/v1/workspace_documents', rawUrl);
  } catch {
    return null;
  }
}

function getSupabaseServiceKey() {
  return (
    getServerEnvValue('SUPABASE_SECRET_KEY') ??
    getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPublicDocumentRow(value: unknown): value is PublicDocumentRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (typeof value.name === 'string' || value.name === null) &&
    value.is_public === true &&
    typeof value.created_at === 'string'
  );
}

async function fetchPublicDocument(documentId: string) {
  const supabaseUrl = getSupabaseRestUrl();
  const serviceKey = getSupabaseServiceKey();

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  supabaseUrl.searchParams.set('select', publicDocumentSelect);
  supabaseUrl.searchParams.set('id', `eq.${documentId}`);
  supabaseUrl.searchParams.set('is_public', 'eq.true');
  supabaseUrl.searchParams.set('limit', '1');

  const response = await fetch(supabaseUrl, {
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    return null;
  }

  const [document] = payload;
  return isPublicDocumentRow(document) ? document : null;
}

const getPublicDocument = createServerFn({ method: 'GET' })
  .validator((data: { documentId: string }) => data)
  .handler(async ({ data }): Promise<PublicDocumentPreview | null> => {
    const documentId = data.documentId.trim();

    if (!documentId) {
      return null;
    }

    return fetchPublicDocument(documentId);
  });

function publicDocumentQuery(documentId: string) {
  return queryOptions({
    queryFn: () => getPublicDocument({ data: { documentId } }),
    queryKey: ['documents', 'public', documentId],
    retry: false,
  });
}

export const Route = createFileRoute('/$locale/documents/$documentId')({
  component: PublicDocumentRoutePage,
  head: ({ params }) => {
    const { locale: routeLocale } = params as PublicDocumentRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const title = locale === 'vi' ? 'Tài liệu' : 'Document Preview';
    const description =
      locale === 'vi'
        ? 'Xem và chia sẻ tài liệu dễ dàng.'
        : 'Review an example Tuturuuu document shared from the platform.';

    return createPageHead({
      description,
      locale,
      title,
    });
  },
  loader: async ({ context, params }) => {
    const { documentId = '' } = params as Partial<PublicDocumentRouteParams>;

    if (!documentId) {
      throw notFound();
    }

    const document = await context.queryClient.ensureQueryData(
      publicDocumentQuery(documentId)
    );

    if (!document) {
      throw notFound();
    }

    return document;
  },
});

function PublicDocumentRoutePage() {
  const { documentId, locale } = Route.useParams() as PublicDocumentRouteParams;
  const initialDocument = Route.useLoaderData() as PublicDocumentPreview;
  const documentQuery = useQuery({
    ...publicDocumentQuery(documentId),
    initialData: initialDocument,
  });
  const messagesLocale = resolveMessagesLocale(locale);

  if (!documentQuery.data) {
    throw notFound();
  }

  return (
    <DocumentPageContent
      document={documentQuery.data}
      locale={messagesLocale}
    />
  );
}
