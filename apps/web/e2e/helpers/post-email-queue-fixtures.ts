import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { TEST_USER } from './constants';
import {
  deleteRestRows,
  expectStatus,
  SUPABASE_URL,
  serviceHeaders,
} from './supabase-rest';

const TOTAL_POST_ROWS = 2000;
const APPROVED_QUEUED_ROWS = 1500;
const APPROVED_SENT_ROWS = 100;
const APPROVED_FAILED_ROWS = 100;
const REJECTED_ROWS = 100;
const INSERT_CHUNK_SIZE = 200;
const DELETE_CHUNK_SIZE = 100;

export type PostEmailQueueScaleFixture = {
  approvedQueuedRows: number;
  groupIds: string[];
  postIds: string[];
  recipientUserIds: string[];
  senderWorkspaceUserId: string;
  totalPostRows: number;
  workspaceId: string;
};

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function insertRows({
  data,
  onConflict,
  request,
  schema,
  table,
}: {
  data: unknown[];
  onConflict?: string;
  request: APIRequestContext;
  schema?: 'private' | 'public';
  table: string;
}) {
  for (const chunk of chunkArray(data, INSERT_CHUNK_SIZE)) {
    const suffix = onConflict
      ? `?on_conflict=${encodeURIComponent(onConflict)}`
      : '';
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/${table}${suffix}`,
      {
        data: chunk,
        failOnStatusCode: false,
        headers: serviceHeaders({
          prefer: onConflict
            ? 'resolution=merge-duplicates,return=minimal'
            : 'return=minimal',
          schema,
        }),
      }
    );

    if (response.status() !== 201) {
      throw new Error(
        `Expected ${schema ?? 'public'}.${table} insert to return 201, got ${response.status()}: ${await response.text()}`
      );
    }
  }
}

async function fetchLinkedWorkspaceUserId({
  request,
  workspaceId,
}: {
  request: APIRequestContext;
  workspaceId: string;
}) {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?select=virtual_user_id&platform_user_id=eq.${TEST_USER.id}&ws_id=eq.${workspaceId}&limit=1`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    }
  );

  if (response.status() !== 200) {
    throw new Error(
      `Expected public.workspace_user_linked_users lookup to return 200, got ${response.status()}: ${await response.text()}`
    );
  }

  const rows = (await response.json()) as Array<{
    virtual_user_id?: string | null;
  }>;
  const virtualUserId = rows.at(0)?.virtual_user_id;

  if (!virtualUserId) {
    throw new Error(
      `Expected workspace ${workspaceId} to have a linked sender workspace user`
    );
  }

  return virtualUserId;
}

function createFixtureIds(): PostEmailQueueScaleFixture {
  return {
    approvedQueuedRows: APPROVED_QUEUED_ROWS,
    groupIds: Array.from({ length: TOTAL_POST_ROWS }, () => randomUUID()),
    postIds: Array.from({ length: TOTAL_POST_ROWS }, () => randomUUID()),
    recipientUserIds: Array.from({ length: TOTAL_POST_ROWS }, () =>
      randomUUID()
    ),
    senderWorkspaceUserId: randomUUID(),
    totalPostRows: TOTAL_POST_ROWS,
    workspaceId: randomUUID(),
  };
}

function getApprovalStatus(index: number) {
  if (
    index <
    APPROVED_QUEUED_ROWS + APPROVED_SENT_ROWS + APPROVED_FAILED_ROWS
  ) {
    return 'APPROVED';
  }

  if (
    index <
    APPROVED_QUEUED_ROWS +
      APPROVED_SENT_ROWS +
      APPROVED_FAILED_ROWS +
      REJECTED_ROWS
  ) {
    return 'REJECTED';
  }

  return 'PENDING';
}

function getQueueStatus(index: number) {
  if (index < APPROVED_QUEUED_ROWS) return 'queued';
  if (index < APPROVED_QUEUED_ROWS + APPROVED_SENT_ROWS) return 'sent';
  if (
    index <
    APPROVED_QUEUED_ROWS + APPROVED_SENT_ROWS + APPROVED_FAILED_ROWS
  ) {
    return 'failed';
  }
  return null;
}

function getQueueCreatedAt(index: number, now: Date) {
  if (index < 25) {
    return new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  }
  if (index < 250) {
    return new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  }
  return now.toISOString();
}

export async function seedPostEmailQueueScaleFixture({
  request,
}: {
  request: APIRequestContext;
}) {
  const fixture = createFixtureIds();
  const now = new Date();
  const nowIso = now.toISOString();
  const suffix = fixture.workspaceId.slice(0, 8);

  try {
    await insertRows({
      request,
      table: 'workspaces',
      data: [
        {
          creator_id: TEST_USER.id,
          handle: `e2e-post-queue-${suffix}`,
          id: fixture.workspaceId,
          name: `E2E Post Queue ${suffix}`,
          personal: false,
        },
      ],
    });
    await insertRows({
      request,
      table: 'workspace_email_credentials',
      data: [
        {
          access_id: 'local-e2e-access-key',
          access_key: 'local-e2e-secret-key',
          region: 'ap-southeast-1',
          source_email: 'notifications@example.test',
          source_name: 'E2E Queue',
          ws_id: fixture.workspaceId,
        },
      ],
    });
    await insertRows({
      request,
      table: 'workspace_members',
      data: [
        {
          type: 'MEMBER',
          user_id: TEST_USER.id,
          ws_id: fixture.workspaceId,
        },
      ],
    });

    fixture.senderWorkspaceUserId = await fetchLinkedWorkspaceUserId({
      request,
      workspaceId: fixture.workspaceId,
    });

    await insertRows({
      request,
      table: 'workspace_users',
      data: fixture.recipientUserIds.map((id, index) => ({
        display_name: `E2E Queue Recipient ${index}`,
        email: `e2e-post-queue-${suffix}-${index}@example.test`,
        full_name: `E2E Queue Recipient ${index}`,
        id,
        ws_id: fixture.workspaceId,
      })),
    });
    await insertRows({
      request,
      table: 'workspace_user_groups',
      data: fixture.groupIds.map((groupId, index) => ({
        id: groupId,
        name: `E2E Queue Group ${suffix}-${index}`,
        ws_id: fixture.workspaceId,
      })),
    });
    await insertRows({
      request,
      table: 'workspace_user_groups_users',
      data: fixture.recipientUserIds.map((userId, index) => ({
        group_id: fixture.groupIds[index],
        role: 'USER',
        user_id: userId,
      })),
    });
    await insertRows({
      request,
      schema: 'private',
      table: 'user_group_posts',
      data: fixture.postIds.map((postId, index) => ({
        approved_at: nowIso,
        approved_by: fixture.senderWorkspaceUserId,
        content: `E2E production-scale post content ${index}`,
        creator_id: fixture.senderWorkspaceUserId,
        group_id: fixture.groupIds[index],
        id: postId,
        post_approval_status: 'APPROVED',
        title: `E2E Queue Post ${index}`,
        updated_by: fixture.senderWorkspaceUserId,
      })),
    });
    await insertRows({
      request,
      schema: 'private',
      table: 'user_group_post_checks',
      data: fixture.postIds.map((postId, index) => {
        const approvalStatus = getApprovalStatus(index);
        return {
          approval_status: approvalStatus,
          approved_at: approvalStatus === 'APPROVED' ? nowIso : null,
          approved_by:
            approvalStatus === 'APPROVED'
              ? fixture.senderWorkspaceUserId
              : null,
          is_completed: index % 7 !== 0,
          notes: `E2E queue note ${index}`,
          post_id: postId,
          rejected_at: approvalStatus === 'REJECTED' ? nowIso : null,
          rejected_by:
            approvalStatus === 'REJECTED'
              ? fixture.senderWorkspaceUserId
              : null,
          rejection_reason:
            approvalStatus === 'REJECTED' ? 'E2E rejected sample' : null,
          user_id: fixture.recipientUserIds[index],
        };
      }),
    });
    await insertRows({
      request,
      table: 'post_email_queue',
      data: fixture.postIds
        .map((postId, index) => {
          const status = getQueueStatus(index);
          if (!status) return null;
          const createdAt = getQueueCreatedAt(index, now);
          return {
            attempt_count: status === 'failed' ? 2 : 0,
            created_at: createdAt,
            group_id: fixture.groupIds[index],
            last_attempt_at:
              status === 'failed'
                ? new Date(now.getTime() - 30 * 60 * 1000).toISOString()
                : null,
            last_error:
              status === 'failed' ? 'E2E provider timeout sample' : null,
            post_id: postId,
            sender_platform_user_id: TEST_USER.id,
            sent_at: status === 'sent' ? nowIso : null,
            status,
            updated_at: createdAt,
            user_id: fixture.recipientUserIds[index],
            ws_id: fixture.workspaceId,
          };
        })
        .filter((row) => row !== null),
    });

    return fixture;
  } catch (error) {
    await cleanupPostEmailQueueScaleFixture({ fixture, request }).catch(
      () => undefined
    );
    throw error;
  }
}

export async function cleanupPostEmailQueueScaleFixture({
  fixture,
  request,
}: {
  fixture: PostEmailQueueScaleFixture;
  request: APIRequestContext;
}) {
  await deleteRestRows({
    request,
    table: 'post_email_queue',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });

  for (const postIds of chunkArray(fixture.postIds, DELETE_CHUNK_SIZE)) {
    await deleteRestRows({
      request,
      table: 'sent_emails',
      filter: `post_id=in.(${postIds.join(',')})`,
    });
  }

  for (const postIds of chunkArray(fixture.postIds, DELETE_CHUNK_SIZE)) {
    await deleteRestRows({
      request,
      schema: 'private',
      table: 'user_group_post_checks',
      filter: `post_id=in.(${postIds.join(',')})`,
    });
  }

  for (const postIds of chunkArray(fixture.postIds, DELETE_CHUNK_SIZE)) {
    await deleteRestRows({
      request,
      schema: 'private',
      table: 'user_group_posts',
      filter: `id=in.(${postIds.join(',')})`,
    });
  }
  for (const groupIds of chunkArray(fixture.groupIds, DELETE_CHUNK_SIZE)) {
    await deleteRestRows({
      request,
      table: 'workspace_user_groups_users',
      filter: `group_id=in.(${groupIds.join(',')})`,
    });
    await deleteRestRows({
      request,
      table: 'workspace_user_groups',
      filter: `id=in.(${groupIds.join(',')})`,
    });
  }
  await deleteRestRows({
    request,
    table: 'workspace_user_linked_users',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await deleteRestRows({
    request,
    table: 'workspace_users',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await deleteRestRows({
    request,
    table: 'workspace_members',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await deleteRestRows({
    request,
    table: 'workspace_email_credentials',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await expectStatus(
    await request.delete(
      `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${fixture.workspaceId}`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders({ prefer: 'return=minimal' }),
      }
    ),
    204
  );
}
