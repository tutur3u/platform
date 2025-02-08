import UserCard from './card';
import { CheckAll } from './check-all';
import { EmailList } from './email-list';
import { createClient } from '@repo/supabase/next/server';
import type { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { format } from 'date-fns';
import { Check, CheckCheck, CircleHelp, Clock, Send, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
  const t = await getTranslations();
  const { wsId, groupId, postId } = await params;

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

  const hasEmailSendingPermission = true;

  return (
    <div>
      <FeatureSummary
        title={
          <>
            <Link
              href={`/${wsId}/users/groups/${groupId}`}
              className="text-2xl font-bold hover:underline"
            >
              {group.name}
            </Link>
            {post.created_at && (
              <div className="flex items-center gap-0.5 text-xs opacity-70">
                <Clock className="h-3 w-3" />
                {format(new Date(post.created_at), 'HH:mm, dd/MM/yyyy')}
              </div>
            )}
            <Separator className="my-2" />
          </>
        }
        description={
          <div className="flex flex-col gap-2">
            <h2 className="w-fit rounded border border-dynamic-blue/15 bg-dynamic-blue/15 px-2 text-xl font-semibold text-dynamic-blue uppercase">
              {post?.title?.trim() || t('common.unknown')}
            </h2>
            <p className="text-sm opacity-70">
              {post?.content?.trim() || t('common.empty')}
            </p>
          </div>
        }
        secondaryTriggerTitle={`${t('ws_post_details.check_all')}`}
        secondaryTriggerIcon={<CheckCheck className="mr-1 h-5 w-5" />}
        secondaryTitle={t('ws_post_details.check_all')}
        form={
          <CheckAll
            wsId={wsId}
            groupId={groupId}
            postId={postId}
            users={users}
            completed={status.checked === status.count}
          />
        }
        disableSecondaryTrigger={status.checked === status.count}
        action={
          hasEmailSendingPermission ? (
            <EmailList wsId={wsId} groupId={groupId} />
          ) : (
            <CheckAll
              wsId={wsId}
              groupId={groupId}
              postId={postId}
              users={users}
              completed={status.checked === status.count}
            />
          )
        }
        showSecondaryTrigger={hasEmailSendingPermission}
      />
      <Separator className="my-4" />
      <div className="gird-cols-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Send />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-purple/15" />
          <div className="text-xl font-semibold md:text-3xl">
            {status.sent?.length}
            <span className="opacity-50">/{status.count}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-green/15 bg-dynamic-green/15 p-4 text-dynamic-green">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Check />
            {t('common.completed')}
          </div>
          <Separator className="my-1 bg-dynamic-green/15" />
          <div className="text-3xl font-semibold">
            {status.checked}
            <span className="opacity-50">/{status.count}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
          <div className="flex items-center gap-2 text-xl font-bold">
            <X />
            {t('common.incomplete')}
          </div>
          <Separator className="my-1 bg-dynamic-red/15" />
          <div className="text-3xl font-semibold">
            {status.failed}
            <span className="opacity-50">/{status.count}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-blue/15 bg-dynamic-blue/15 p-4 text-dynamic-blue">
          <div className="flex items-center gap-2 text-xl font-bold">
            <CircleHelp />
            {t('common.unknown')}
          </div>
          <Separator className="my-1 bg-dynamic-blue/15" />
          <div className="text-3xl font-semibold">
            {status.tenative}
            <span className="opacity-50">/{status.count}</span>
          </div>
        </div>
      </div>
      <Separator className="my-4" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {users.map((user) => (
          <UserCard
            key={`post-${postId}-${user.id}-${status.checked === status.count}`}
            user={user}
            wsId={wsId}
            post={{
              ...post,
              group_id: groupId,
              group_name: group.name,
            }}
            disableEmailSending={status.sent?.includes(user.id)}
            hideEmailSending={!hasEmailSendingPermission}
          />
        ))}
      </div>
    </div>
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
