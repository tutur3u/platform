import { Check, CheckCheck, CircleHelp, Clock, Send, X } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { format } from 'date-fns';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { CheckAll } from './check-all';
import { PostCheckHistory } from './check-history';
import {
  getGroupData,
  getPostData,
  getPostStatus,
  getRecipientRows,
  type SearchParams,
} from './data';
import { UsersList } from './users-list';

export const metadata: Metadata = {
  title: 'Postid Details',
  description:
    'Manage Postid Details in the Posts area of your Tuturuuu workspace.',
};

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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId, postId }) => {
        const t = await getTranslations();
        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canViewUserGroupsPosts = containsPermission(
          'view_user_groups_posts'
        );
        if (!canViewUserGroupsPosts) {
          notFound();
        }

        const group = await getGroupData(wsId, groupId);
        const post = await getPostData(wsId, groupId, postId);
        const status = await getPostStatus(wsId, groupId, postId);
        const recipients = await getRecipientRows(
          wsId,
          groupId,
          postId,
          await searchParams
        );

        const users = recipients.map(
          (recipient) =>
            ({
              avatar_url: recipient.user_avatar_url,
              display_name: recipient.user_display_name,
              email: recipient.email,
              full_name: recipient.user_full_name,
              href: `/${wsId}/users/database/${recipient.user_id}`,
              id: recipient.user_id,
            }) as WorkspaceUser
        );

        const canUpdateUserGroupsPosts = containsPermission(
          'update_user_groups_posts'
        );
        const canApprovePosts = containsPermission('approve_posts');

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
                    {post.created_at && (
                      <div className="flex items-center gap-0.5 text-nowrap text-xs opacity-70">
                        <Clock className="h-3 w-3" />
                        {format(new Date(post.created_at), 'HH:mm, dd/MM/yyyy')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
                      {t('approvals.status.approved')}:{' '}
                      {status.approvals.approved}
                    </Badge>
                    <Badge className="border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow">
                      {t('approvals.status.pending')}:{' '}
                      {status.approvals.pending}
                    </Badge>
                    <Badge className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red">
                      {t('approvals.status.rejected')}:{' '}
                      {status.approvals.rejected}
                    </Badge>
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
                canUpdateUserGroupsPosts ? (
                  <CheckAll
                    wsId={wsId}
                    groupId={groupId}
                    postId={postId}
                    users={users}
                    completed={status.completed === status.count}
                    canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
                  />
                ) : undefined
              }
              disableSecondaryTrigger={status.completed === status.count}
              showSecondaryTrigger={canUpdateUserGroupsPosts}
            />
            <div className="mt-2 flex justify-end">
              <PostCheckHistory
                groupId={groupId}
                postId={postId}
                users={users}
                wsId={wsId}
              />
            </div>
            <Separator className="my-4" />
            <div className="gird-cols-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <Send />
                  {t('ws-post-emails.sent_emails')}
                </div>
                <Separator className="my-1 bg-dynamic-purple/15" />
                <div className="font-semibold text-xl md:text-3xl">
                  {status.sent}
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
                  {status.completed}
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
                  {status.incomplete}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
              <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-blue/15 bg-dynamic-blue/15 p-4 text-dynamic-blue">
                <div className="flex items-center gap-2 font-bold text-xl">
                  <CircleHelp />
                  {t('post-email-data-table.missing_check')}
                </div>
                <Separator className="my-1 bg-dynamic-blue/15" />
                <div className="font-semibold text-3xl">
                  {status.missing_check}
                  <span className="opacity-50">/{status.count}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="rounded border border-dynamic-orange/15 bg-dynamic-orange/10 p-4 text-dynamic-orange">
                <div className="font-semibold">
                  {t('post-email-data-table.undeliverable')}
                </div>
                <div className="text-2xl">{status.undeliverable}</div>
              </div>
              <div className="rounded border border-dynamic-orange/15 bg-dynamic-orange/10 p-4 text-dynamic-orange">
                <div className="font-semibold">
                  {t('post-email-data-table.delivery_failed')}
                </div>
                <div className="text-2xl">{status.delivery_failed}</div>
              </div>
              <div className="rounded border border-dynamic-blue/15 bg-dynamic-blue/10 p-4 text-dynamic-blue">
                <div className="font-semibold">
                  {t('post-email-data-table.processing')}
                </div>
                <div className="text-2xl">{status.processing}</div>
              </div>
              <div className="rounded border border-dynamic-green/15 bg-dynamic-green/10 p-4 text-dynamic-green">
                <div className="font-semibold">
                  {t('post-email-data-table.queued')}
                </div>
                <div className="text-2xl">{status.queued}</div>
              </div>
            </div>
            <Separator className="my-4" />
            <UsersList
              recipients={recipients}
              wsId={wsId}
              post={{
                ...post,
                group_id: groupId,
              }}
              canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
              canApprovePosts={canApprovePosts}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
