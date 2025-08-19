import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { InternalEmail } from '@tuturuuu/types/db';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import MailClientWrapper from '../client';

interface SearchParams {
  page?: string;
  pageSize?: string;
  userId?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams?: Promise<SearchParams>;
}

export default async function MailPage({ params, searchParams }: Props) {
  const { wsId: id } = params;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const user = await getCurrentUser();
  if (!workspace || !user) notFound();

  const cookiesStore = await cookies();
  const collapsed = cookiesStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = cookiesStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const rawBehavior = behaviorCookie?.value;

  const isValidBehavior = (
    value: string | undefined,
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior,
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    try {
      defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
    } catch {
      defaultCollapsed = false;
    }
  }

  const { page = '1', size = '10' } = await searchParams;
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(size, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = start + parsedSize - 1;

  const getMailsData = async () => {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from('mails')
      .select('*', { count: 'exact' })
      .eq('workspace_id', wsId)
      .eq('sender_id', user.id)
      .eq('type', 'sent')
      .order('created_at', { ascending: false })
      .range(start, end);

    if (error) {
      console.error('Error fetching mails:', error);
      throw error;
    }

    return { data: data || [], count: count || 0 };
  };

  try {
    const { data, count } = await getMailsData();
    const totalPages = Math.ceil((count || 0) / parsedSize);

    return (
      <Layout
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={[]}
        actions={null}
        userPopover={null}
      >
        <div className="container mx-auto p-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Sent Mails</h1>
            <p className="text-muted-foreground">
              View all mails you have sent from this workspace
            </p>
          </div>

          {data.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No sent mails found</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {data.map((mail) => (
                  <div
                    key={mail.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{mail.subject}</h3>
                        <p className="text-sm text-muted-foreground">
                          To: {mail.recipients?.join(', ') || 'No recipients'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Sent: {new Date(mail.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Sent
                        </span>
                      </div>
                    </div>
                    {mail.content && (
                      <div className="mt-3 text-sm text-muted-foreground line-clamp-3">
                        {mail.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                  <Pagination
                    currentPage={parsedPage}
                    totalPages={totalPages}
                    baseUrl={`/${wsId}/mail/sent`}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Layout>
    );
  } catch (error) {
    console.error('Error in MailSentPage:', error);
    return (
      <Layout
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={[]}
        actions={null}
        userPopover={null}
      >
        <div className="container mx-auto p-4">
          <div className="text-center py-8">
            <p className="text-red-600">Error loading sent mails. Please try again.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }
}

async function getMailsData({
  page = '1',
  pageSize = '10',
  userId,
  retry = true,
}: SearchParams & { retry?: boolean } = {}) {
  const supabase = await createClient();

  let queryBuilder = supabase.from('internal_emails').select(`*`, {
    count: 'exact',
  });

  if (userId) {
    queryBuilder = queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    if (!retry) throw error;
    return getMailsData({ pageSize, retry: false });
  }

  return {
    data,
    count: count || 0,
  } as { data: InternalEmail[]; count: number };
}

async function getWorkspaceMailCredential(wsId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_email_credentials')
    .select('*')
    .eq('ws_id', wsId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
