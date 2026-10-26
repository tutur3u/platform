import { describe, expect, it, vi } from 'vitest';
import {
  classifyWorkspaceStoragePath,
  memoizeWorkspaceStorageAccessContext,
  resolveWorkspaceStorageAccess,
  resolveWorkspaceStorageFolderAccess,
  type WorkspaceStorageAccessContext,
  type WorkspaceStorageOperation,
} from './workspace-storage-access';

const WS = '5707a6e0-0000-4000-8000-000000009711';
const OWNER = 'owner';
const MEMBER = 'member';
const CHAT_OWNER = '5707a6e0-0000-4000-8000-000000009721';
const CHAT_MEMBER = '5707a6e0-0000-4000-8000-000000009722';

type Actor = 'nonmember' | 'member' | 'viewer' | 'manager' | 'owner';

function contextFor(actor: Actor): WorkspaceStorageAccessContext {
  const userId =
    actor === 'owner' ? OWNER : actor === 'member' ? MEMBER : actor;
  return {
    userId,
    isWorkspaceMember: async (wsId) => wsId === WS && actor !== 'nonmember',
    getDrivePermissions: async () => ({
      manage: actor === 'manager',
      view: actor === 'viewer',
    }),
    getAiChatCreatorId: async (chatId) =>
      chatId === CHAT_OWNER ? OWNER : chatId === CHAT_MEMBER ? MEMBER : null,
  };
}

// Same objects and expectations as the pgTAP matrix in
// apps/database/supabase/tests/workspace-storage-least-privilege-rls.sql
// (service_role is not modelled here: it bypasses RLS and these checks).
const OBJECTS: Record<string, string> = {
  drive_root: `${WS}/drive.txt`,
  drive_folder: `${WS}/docs/report.pdf`,
  chat_owner: `${WS}/chat/${CHAT_OWNER}/a.png`,
  chat_other: `${WS}/chat/${CHAT_MEMBER}/b.png`,
  chats_owner: `${WS}/chats/ai/resources/${CHAT_OWNER}/c.pdf`,
  chats_temp: `${WS}/chats/ai/resources/temp/${OWNER}/d.pdf`,
  chats_other: `${WS}/chats/conversations/e.bin`,
  external_apps: `${WS}/external-apps/app/chat/conv/att`,
  reserved: `${WS}/.tuturuuu/mobile-deployment-vault/v/app.ipa`,
  recordings: `${WS}/recordings/m/s/r.webm`,
  project_updates: `${WS}/project-updates/u/p.png`,
  template_bg: `${WS}/template-backgrounds/t.png`,
  ai_agent_imports: `${WS}/AI Agent Imports/discord/channel/thread/g.png`,
  mira_images: `${WS}/mira/images/h.png`,
  drive_mira_qr: `${WS}/drive/mira/qr/q.png`,
};

function expectedFlags(actor: Actor, key: string): string {
  if (actor === 'nonmember') return '----';
  if (key === 'project_updates') return 'SIUD';
  if (['drive_root', 'drive_folder', 'drive_mira_qr'].includes(key)) {
    return actor === 'manager' ? 'SIUD' : actor === 'viewer' ? 'S---' : '----';
  }
  if (key === 'template_bg') return actor === 'manager' ? 'SIUD' : 'S---';
  if (['chat_owner', 'chats_owner', 'chats_temp'].includes(key)) {
    return actor === 'owner' ? 'S--D' : '----';
  }
  if (key === 'chat_other') return actor === 'member' ? 'S--D' : '----';
  return '----';
}

const OPERATIONS: [WorkspaceStorageOperation, string][] = [
  ['select', 'S'],
  ['insert', 'I'],
  ['update', 'U'],
  ['delete', 'D'],
];

const ACTORS: Actor[] = ['nonmember', 'member', 'viewer', 'manager', 'owner'];

describe('resolveWorkspaceStorageAccess (RLS parity matrix)', () => {
  const cases = ACTORS.flatMap((actor) =>
    Object.entries(OBJECTS).flatMap(([key, name]) =>
      OPERATIONS.map(([operation, flag]) => ({
        actor,
        allowed: expectedFlags(actor, key).includes(flag),
        key,
        name,
        operation,
      }))
    )
  );

  it.each(cases)(
    '$actor $operation $key -> allowed=$allowed',
    async ({ actor, allowed, name, operation }) => {
      await expect(
        resolveWorkspaceStorageAccess(name, operation, contextFor(actor))
      ).resolves.toBe(allowed ? 'allowed' : 'forbidden');
    }
  );
});

describe('classifyWorkspaceStoragePath', () => {
  it.each([
    ['no workspace folder', 'drive.txt'],
    ['non-uuid workspace', 'ws-1/docs/a.pdf'],
    ['dot-dot segment', `${WS}/docs/../chats/x`],
    ['dot segment', `${WS}/./chats/ai/resources/temp/${OWNER}/x`],
    ['empty segment', `${WS}//docs/a.pdf`],
    ['encoded dot-dot', `${WS}/docs/%2e%2e/chats/x`],
    ['encoded private root', `${WS}/%63hats/ai/resources/${CHAT_OWNER}/x`],
    ['encoded separator into a private root', `${WS}/chats%2Fai/resources/x`],
    [
      'double-encoded private root',
      `${WS}/%2563hats/ai/resources/temp/${OWNER}/x`,
    ],
  ])('rejects %s', (_, name) => {
    expect(classifyWorkspaceStoragePath(name)).toBeNull();
  });

  it('matches private roots case-insensitively, including the spaced root', () => {
    expect(
      classifyWorkspaceStoragePath(`${WS}/ai agent imports/x/y.png`)
    ).toEqual({
      kind: 'private',
      wsId: WS,
    });
    expect(classifyWorkspaceStoragePath(`${WS}/RECORDINGS/m/x.webm`)).toEqual({
      kind: 'private',
      wsId: WS,
    });
    expect(
      classifyWorkspaceStoragePath(
        `${WS}/CHATS/ai/resources/${CHAT_OWNER}/c.pdf`
      )
    ).toEqual({ chatId: CHAT_OWNER, kind: 'ai-chat', wsId: WS });
  });

  it('keeps encoded file names that do not change the rule', () => {
    expect(classifyWorkspaceStoragePath(`${WS}/docs/%41.txt`)).toEqual({
      kind: 'drive',
      wsId: WS,
    });
  });

  it('treats malformed chat folders as service-only', () => {
    expect(classifyWorkspaceStoragePath(`${WS}/chat/not-a-chat/a.png`)).toEqual(
      {
        kind: 'private',
        wsId: WS,
      }
    );
    expect(
      classifyWorkspaceStoragePath(`${WS}/chats/ai/resources/not-a-chat/a.png`)
    ).toEqual({ kind: 'private', wsId: WS });
  });
});

describe('resolveWorkspaceStorageAccess edge cases', () => {
  it('returns invalid for traversal and encoded aliases', async () => {
    await expect(
      resolveWorkspaceStorageAccess(
        `${WS}/docs/../x`,
        'select',
        contextFor('manager')
      )
    ).resolves.toBe('invalid');
    await expect(
      resolveWorkspaceStorageAccess(
        `${WS}/%63hats/ai/resources/${CHAT_OWNER}/c.pdf`,
        'select',
        contextFor('owner')
      )
    ).resolves.toBe('invalid');
  });

  it('denies a chat that does not exist, even for members', async () => {
    await expect(
      resolveWorkspaceStorageAccess(
        `${WS}/chats/ai/resources/5707a6e0-0000-4000-8000-0000000097ff/x.pdf`,
        'select',
        contextFor('owner')
      )
    ).resolves.toBe('forbidden');
  });

  it('does not look up permissions for private roots or non-members', async () => {
    const context = contextFor('manager');
    const getDrivePermissions = vi.spyOn(context, 'getDrivePermissions');
    await resolveWorkspaceStorageAccess(OBJECTS.recordings!, 'select', context);
    expect(getDrivePermissions).not.toHaveBeenCalled();
  });

  it('propagates lookup failures', async () => {
    const context = {
      ...contextFor('owner'),
      getAiChatCreatorId: async () => {
        throw new Error('lookup failed');
      },
    };
    await expect(
      resolveWorkspaceStorageAccess(OBJECTS.chats_owner!, 'select', context)
    ).rejects.toThrow('lookup failed');
  });

  it('authorizes folders as their direct children', async () => {
    await expect(
      resolveWorkspaceStorageFolderAccess(
        `${WS}/chats/ai/resources/${CHAT_OWNER}/`,
        'select',
        contextFor('owner')
      )
    ).resolves.toBe('allowed');
    await expect(
      resolveWorkspaceStorageFolderAccess(
        `${WS}/chats/ai/resources/${CHAT_OWNER}`,
        'select',
        contextFor('member')
      )
    ).resolves.toBe('forbidden');
  });

  it('memoizes lookups per workspace and chat', async () => {
    const base = contextFor('owner');
    const isWorkspaceMember = vi.spyOn(base, 'isWorkspaceMember');
    const getAiChatCreatorId = vi.spyOn(base, 'getAiChatCreatorId');
    const context = memoizeWorkspaceStorageAccessContext(base);
    await Promise.all([
      resolveWorkspaceStorageAccess(OBJECTS.chats_owner!, 'select', context),
      resolveWorkspaceStorageAccess(
        `${WS}/chats/ai/resources/${CHAT_OWNER}/other.pdf`,
        'select',
        context
      ),
    ]);
    expect(isWorkspaceMember).toHaveBeenCalledTimes(1);
    expect(getAiChatCreatorId).toHaveBeenCalledTimes(1);
  });
});
