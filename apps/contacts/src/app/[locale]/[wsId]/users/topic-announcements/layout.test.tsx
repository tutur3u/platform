import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secrets: [] as { name: string; value: string }[],
}));

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));
vi.mock('@/components/workspace-wrapper', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/lib/workspace', () => ({
  getContactsWorkspacePermissions: vi.fn(async () => ({
    containsPermission: () => true,
  })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecret: (name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name),
  getSecrets: vi.fn(async () => mocks.secrets),
}));
vi.mock('./teacher-topics-view', () => ({ TeacherTopicsView: () => null }));
vi.mock('./topic-announcements-shell', () => ({
  TopicAnnouncementsShell: () => null,
}));

const { default: TopicAnnouncementsLayout } = await import('./layout');
const gates = await import('./topic-announcements-gate');
const { TopicAnnouncementsShell } = await import('./topic-announcements-shell');

type RenderWorkspace = (context: {
  isPersonal: boolean;
  wsId: string;
}) => Promise<ReactElement>;

async function view(isPersonal: boolean, secret?: string) {
  mocks.secrets =
    secret === undefined
      ? []
      : [{ name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: secret }];
  const wrapper = (await TopicAnnouncementsLayout({
    children: null,
    params: Promise.resolve({ locale: 'en', wsId: 'ws' }),
  })) as ReactElement<{ children: RenderWorkspace }>;
  return wrapper.props.children({ isPersonal, wsId: 'ws' });
}

beforeEach(() => {
  mocks.secrets = [];
});

describe('topic announcements layout', () => {
  it('never mounts the module on a personal workspace, even when enabled', async () => {
    expect((await view(true, 'true')).type).toBe(
      gates.TopicAnnouncementsPersonalGate
    );
    expect((await view(true)).type).toBe(gates.TopicAnnouncementsPersonalGate);
  });

  it('mounts the module only for exactly "true", like the topic APIs', async () => {
    expect((await view(false, 'true')).type).toBe(TopicAnnouncementsShell);
    for (const value of ['TRUE', ' true', 'false']) {
      expect((await view(false, value)).type).toBe(
        gates.TopicAnnouncementsDisabledGate
      );
    }
  });
});
