import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { UserGroupPost } from '@tuturuuu/types/db';
import type { GroupPostRecipientRow } from '@tuturuuu/users-core/lib/group-post-recipient-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import UserCard from '../app/[locale]/[wsId]/users/groups/[groupId]/posts/[postId]/card';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@tuturuuu/users-ui/components/post-approval-actions', () => ({
  PostApprovalActions: () => null,
}));

const wsId = '11111111-1111-4111-8111-111111111111';
const post: UserGroupPost = {
  workspace_user_groups: null,
  workspace_users: null,
  id: '33333333-3333-4333-8333-333333333333',
  group_id: '22222222-2222-4222-8222-222222222222',
  approved_at: null,
  approved_by: null,
  content: null,
  created_at: '2026-10-18T00:00:00Z',
  creator_id: null,
  notes: null,
  post_approval_status: 'PENDING',
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  review_revision: 0,
  title: 'Synthetic lesson',
  updated_by: null,
};
const payloadSchema = z.object({
  user_id: z.string(),
  is_completed: z.boolean(),
  notes: z.string().nullable().optional(),
  post_id: z.string().optional(),
});
type Stored = {
  notes: string | null;
  is_completed: boolean;
  approval: string;
  sentAt: string;
};
const store = new Map<string, Stored>();
const sent: z.infer<typeof payloadSchema>[] = [];
let nextWrite: Promise<void> | undefined;
let rejectNext = false;
function row(id: string): GroupPostRecipientRow {
  const value = store.get(id);
  if (!value) throw new Error('Missing synthetic recipient');
  return {
    row_key: id,
    check_created_at: '2026-10-18T00:00:00Z',
    notes: value.notes,
    user_id: id,
    email_id: null,
    is_completed: value.is_completed,
    has_check: true,
    approval_status: 'APPROVED',
    approval_rejection_reason: null,
    ws_id: wsId,
    email: null,
    recipient: id,
    user_display_name: id,
    user_full_name: id,
    user_phone: null,
    user_avatar_url: null,
    post_id: post.id,
    post_title: null,
    post_content: null,
    post_created_at: null,
    group_id: post.group_id,
    group_name: null,
    subject: null,
    queue_status: null,
    queue_attempt_count: null,
    queue_last_error: null,
    queue_sent_at: value.sentAt,
    delivery_issue_reason: null,
    can_remove_approval: false,
    review_stage: 'pending_approval',
  };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      {[...store.keys()].map((id) => (
        <section aria-label={id} key={id}>
          <UserCard
            wsId={wsId}
            post={post}
            recipient={row(id)}
            canUpdateUserGroupsPosts
          />
        </section>
      ))}
    </QueryClientProvider>
  );
  return {
    unmount() {
      result.unmount();
      client.clear();
    },
  };
}
function card(id: string) {
  return within(screen.getByRole('region', { name: id }));
}
async function submit(id: string, name: string) {
  const previous = sent.length;
  fireEvent.click(card(id).getByRole('button', { name }));
  await waitFor(() => expect(sent).toHaveLength(previous + 1));
  await waitFor(() =>
    expect(card(id).getByRole('button', { name })).toBeEnabled()
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  sent.length = 0;
  nextWrite = undefined;
  rejectNext = false;
  for (const id of ['student-a', 'student-b', 'student-c', 'untouched'])
    store.set(id, {
      notes: id === 'untouched' ? 'Newer server remark' : '',
      is_completed: false,
      approval: 'APPROVED',
      sentAt: '2026-10-17T00:00:00Z',
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PUT' || typeof init.body !== 'string')
        throw new Error('Unexpected synthetic request');
      expect(new URL(String(_input), 'http://localhost').pathname).toBe(
        `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/${post.id}`
      );
      const payload = payloadSchema.parse(JSON.parse(init.body));
      const current = store.get(payload.user_id);
      if (!current) throw new Error('Unexpected synthetic recipient');
      sent.push(payload);
      const held = nextWrite;
      nextWrite = undefined;
      await held;
      if (rejectNext) {
        rejectNext = false;
        return new Response(
          JSON.stringify({ message: 'Synthetic save rejection' }),
          { status: 500 }
        );
      }
      store.set(payload.user_id, {
        ...current,
        is_completed: payload.is_completed,
        ...(payload.notes === undefined ? {} : { notes: payload.notes }),
      });
      return new Response(JSON.stringify({ message: 'updated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('recipient remark persistence through completion and remount', () => {
  it('persists each edited remark when completion is the save action', async () => {
    const first = mount();
    for (const id of ['student-a', 'student-b', 'student-c']) {
      fireEvent.change(card(id).getByRole('textbox'), {
        target: { value: `Remark for ${id}` },
      });
      await submit(
        id,
        id === 'student-b' ? 'common.incomplete' : 'common.completed'
      );
    }
    first.unmount();
    mount();
    for (const id of ['student-a', 'student-b', 'student-c'])
      expect(card(id).getByRole('textbox')).toHaveValue(`Remark for ${id}`);
    expect(store.get('untouched')).toEqual({
      notes: 'Newer server remark',
      is_completed: false,
      approval: 'APPROVED',
      sentAt: '2026-10-17T00:00:00Z',
    });
    expect(sent.map((x) => x.notes)).toEqual([
      'Remark for student-a',
      'Remark for student-b',
      'Remark for student-c',
    ]);
  });
  it('retains remarks through explicit Save using the same persistent transport', async () => {
    const first = mount();
    for (const id of ['student-a', 'student-b', 'student-c']) {
      fireEvent.change(card(id).getByRole('textbox'), {
        target: { value: `Explicit ${id}` },
      });
      await submit(id, 'common.save');
    }
    first.unmount();
    mount();
    for (const id of ['student-a', 'student-b', 'student-c'])
      expect(card(id).getByRole('textbox')).toHaveValue(`Explicit ${id}`);
  });
  it('omits pristine notes while preserving independently updated stored remarks', async () => {
    const first = mount();
    const current = store.get('untouched');
    if (!current) throw new Error('Missing synthetic recipient');
    store.set('untouched', { ...current, notes: 'Concurrent server remark' });
    await submit('untouched', 'common.completed');
    expect(sent[0]).not.toHaveProperty('notes');
    first.unmount();
    mount();
    expect(card('untouched').getByRole('textbox')).toHaveValue(
      'Concurrent server remark'
    );
  });
  for (const later of ['Later draft', '']) {
    it(`keeps later edits during completion and persists the next snapshot: ${later || 'revert'}`, async () => {
      mount();
      const gate = Promise.withResolvers<void>();
      nextWrite = gate.promise;
      fireEvent.change(card('student-a').getByRole('textbox'), {
        target: { value: 'First draft' },
      });
      fireEvent.click(
        card('student-a').getByRole('button', { name: 'common.completed' })
      );
      await waitFor(() => expect(sent).toHaveLength(1));
      fireEvent.change(card('student-a').getByRole('textbox'), {
        target: { value: later },
      });
      gate.resolve();
      await waitFor(() =>
        expect(
          card('student-a').getByRole('button', { name: 'common.completed' })
        ).toBeEnabled()
      );
      expect(store.get('student-a')?.notes).toBe('First draft');
      expect(card('student-a').getByRole('textbox')).toHaveValue(later);
      await submit('student-a', 'common.incomplete');
      expect(sent[1]?.notes).toBe(later);
      expect(store.get('student-a')?.notes).toBe(later);
    });
  }
  it('retains a rejected draft and persists it on deliberate completion retry', async () => {
    const first = mount();
    rejectNext = true;
    fireEvent.change(card('student-a').getByRole('textbox'), {
      target: { value: 'Retry this remark' },
    });
    await submit('student-a', 'common.completed');
    expect(store.get('student-a')?.notes).toBe('');
    expect(card('student-a').getByRole('textbox')).toHaveValue(
      'Retry this remark'
    );
    expect(refresh).not.toHaveBeenCalled();
    await submit('student-a', 'common.completed');
    expect(sent[1]?.notes).toBe('Retry this remark');
    first.unmount();
    mount();
    expect(card('student-a').getByRole('textbox')).toHaveValue(
      'Retry this remark'
    );
  });
  it('persists an explicit clear with completion without clearing another student', async () => {
    const current = store.get('student-a');
    if (!current) throw new Error('Missing synthetic recipient');
    store.set('student-a', { ...current, notes: 'Clear this remark' });
    const first = mount();
    fireEvent.change(card('student-a').getByRole('textbox'), {
      target: { value: '' },
    });
    await submit('student-a', 'common.completed');
    expect(sent[0]?.notes).toBe('');
    first.unmount();
    mount();
    expect(card('student-a').getByRole('textbox')).toHaveValue('');
    expect(card('untouched').getByRole('textbox')).toHaveValue(
      'Newer server remark'
    );
    expect(store.get('student-a')?.approval).toBe('APPROVED');
    expect(store.get('student-a')?.sentAt).toBe('2026-10-17T00:00:00Z');
  });
});
