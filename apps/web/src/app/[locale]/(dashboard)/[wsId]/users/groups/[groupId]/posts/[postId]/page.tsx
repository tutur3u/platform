import { Check, CheckCheck, CircleHelp, Clock, Send, X } from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { Database } from '@tuturuuu/types/supabase';
import { Badge } from '@tuturuuu/ui/badge';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { format } from 'date-fns';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { CheckAll } from './check-all';
import { EmailList } from './email-list';
import { UsersList } from './users-list';

export const metadata: Metadata = {
  title: 'Postid Details',
  description:
    'Manage Postid Details in the Posts area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
    postId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function HomeworkCheck({ params, searchParams }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId, postId }) => {
        const t = await getTranslations();
        const { containsPermission } = await getPermissions({ wsId });
        const canViewUserGroupsPosts = containsPermission(
          'view_user_groups_posts'
        );
        if (!canViewUserGroupsPosts) {
          notFound();
        }
        const post = await getPostData(postId);
        const group = await getGroupData(wsId, groupId);
        const status = await getPostStatus(groupId, postId);

        const { data: rawUsers } = await getUserData(
          wsId,
          groupId,
          await searchParams
        );

        const users = rawUsers.map((u) => ({
          ...u,
          href: `/${wsId}/users/database/${u.id}`,
        }));

        // Check email blacklist status for all users
        const userEmails = users
          .map((u) => u.email)
          .filter(Boolean) as string[];
        const blacklistedEmails = await getEmailBlacklistStatus(userEmails);

        // Get permissions

        const canUpdateUserGroupsPosts = containsPermission(
          'update_user_groups_posts'
        );
        const canSendUserGroupPostEmails = containsPermission(
          'send_user_group_post_emails'
        );

        type ApprovalStatus = Database['public']['Enums']['approval_status'];
        const approvalStatus: ApprovalStatus =
          (post.post_approval_status as ApprovalStatus) ?? 'PENDING';
        const isApproved = approvalStatus === 'APPROVED';

        return (
          <div>
            <FeatureSummary
              title={
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${wsId}/users/groups/${groupId}`}
                      className="font-bold text-2xl hover:underline"
                    >
                      {group.name}
                    </Link>
                    {!isApproved && (
                      <Badge
                        variant={
                          approvalStatus === 'REJECTED'
                            ? 'destructive'
                            : 'outline'
                        }
                        className={
                          approvalStatus === 'PENDING'
                            ? 'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow'
                            : ''
                        }
                      >
                        {approvalStatus === 'REJECTED'
                          ? t('approvals.status.rejected')
                          : t('approvals.status.pending')}
                      </Badge>
                    )}
                    {post.created_at && (
                      <div className="flex items-center gap-0.5 text-nowrap text-xs opacity-70">
                        <Clock className="h-3 w-3" />
                        {format(new Date(post.created_at), 'HH:mm, dd/MM/yyyy')}
                      </div>
                    )}
                  </div>
                  <Separator />
                </div>
              }
              description={
                post?.title || post?.content ? (
                  <div className="flex flex-col gap-2">
                    {post?.title && (
                      <h2 className="w-fit rounded border border-dynamic-blue/15 bg-dynamic-blue/15 px-2 font-semibold text-dynamic-blue text-xl uppercase">
                        {post?.title?.trim() || t('common.unknown')}
                      </h2>
                    )}
                    {post?.content?.trim() && (
                      <p className="text-sm opacity-70">
                        {post?.content?.trim() || t('common.empty')}
                      </p>
                    )}
                  </div>
                ) : undefined
              }
              secondaryTriggerTitle={`${t('ws_post_details.check_all')}`}
              secondaryTriggerIcon={<CheckCheck className="mr-1 h-5 w-5" />}
              secondaryTitle={t('ws_post_details.check_all')}
              form={
                canUpdateUserGroupsPosts && isApproved ? (
                  <CheckAll
                    wsId={wsId}
                    groupId={groupId}
                    postId={postId}
                    users={users}
                    completed={status.checked === status.count}
                    canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
                  />
                ) : undefined
              }
              disableSecondaryTrigger={
                status.checked === status.count || !isApproved
              }
              action={
                canSendUserGroupPostEmails && isApproved ? (
                  <EmailList wsId={wsId} groupId={groupId} />
                ) : null
              }
              showSecondaryTrigger={canUpdateUserGroupsPosts && isApproved}
            />
            <Separator className="my-4" />
            <div className="gird-cols-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <Send />
                  {t('ws-post-emails.sent_emails')}
                </div>
                <Separator className="my-1 bg-dynamic-purple/15" />
                <div className="font-semibold text-xl md:text-3xl">
                  {status.sent?.length}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-green/15 bg-dynamic-green/15 p-4 text-dynamic-green">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <Check />
                  {t('common.completed')}
                </div>
                <Separator className="my-1 bg-dynamic-green/15" />
                <div className="font-semibold text-3xl">
                  {status.checked}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <X />
                  {t('common.incomplete')}
                </div>
                <Separator className="my-1 bg-dynamic-red/15" />
                <div className="font-semibold text-3xl">
                  {status.failed}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-blue/15 bg-dynamic-blue/15 p-4 text-dynamic-blue">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <CircleHelp />
                  {t('common.unknown')}
                </div>
                <Separator className="my-1 bg-dynamic-blue/15" />
                <div className="font-semibold text-3xl">
                  {status.tenative}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
            </div>
            <Separator className="my-4" />
            <UsersList
              users={users}
              wsId={wsId}
              post={{
                ...post,
                group_id: groupId,
              }}
              canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
              canSendUserGroupPostEmails={canSendUserGroupPostEmails}
              sentEmailUserIds={status.sent || []}
              blacklistedEmails={blacklistedEmails}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getPostData(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_group_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

async function getGroupData(wsId: string, groupId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

async function getPostStatus(groupId: string, postId: string) {
  const supabase = await createClient();

  const { data: users, count } = await supabase
    .from('workspace_user_groups_users')
    .select(
      '...workspace_users(id, user_group_post_checks!inner(post_id, is_completed))',
      {
        count: 'exact',
      }
    )
    .eq('group_id', groupId)
    .eq('workspace_users.user_group_post_checks.post_id', postId);

  const { data: sentEmails } = await supabase
    .from('sent_emails')
    .select('receiver_id', {
      count: 'exact',
    })
    .eq('post_id', postId);

  return {
    sent: sentEmails?.map((email) => email.receiver_id) || [],
    checked: users?.filter((user) =>
      user?.user_group_post_checks?.find((check) => check?.is_completed)
    ).length,
    failed: users?.filter((user) =>
      user?.user_group_post_checks?.find((check) => !check?.is_completed)
    ).length,
    tenative: users?.filter((user) => !user.id).length,
    count,
  };
}

async function getUserData(
  wsId: string,
  groupId: string,
  {
    q,
    // page = '1',
    // pageSize = '10',
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_users')
    .select('...workspace_users!inner(*)', {
      count: 'exact',
    })
    .eq('group_id', groupId);

  if (q) queryBuilder.ilike('workspace_users.display_name', `%${q}%`);

  // if (page && pageSize) {
  //   const parsedPage = Number.parseInt(page);
  //   const parsedSize = Number.parseInt(pageSize);
  //   const start = (parsedPage - 1) * parsedSize;
  //   const end = parsedPage * parsedSize;
  //   queryBuilder.range(start, end).limit(parsedSize);
  // }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getUserData(wsId, groupId, {
      q,
      // pageSize,
      excludedGroups,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}

async function getEmailBlacklistStatus(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();

  const sbAdmin = await createAdminClient();
  const { data: blockStatuses, error } = await sbAdmin.rpc(
    'get_email_block_statuses',
    { p_emails: emails }
  );

  if (error) {
    console.error('Error checking email blacklist:', error);
    return new Set();
  }

  const blacklistedEmails = new Set(
    (blockStatuses || [])
      .filter((status) => status.is_blocked && status.email)
      .map((status) => status.email as string)
  );

  return blacklistedEmails;
}
