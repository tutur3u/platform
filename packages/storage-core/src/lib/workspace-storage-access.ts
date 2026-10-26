/**
 * Path-scoped access rules for the `workspaces` Storage bucket.
 *
 * This is the server-side mirror of the database helper
 * `workspace_storage.object_access` (migration
 * 20261026100000_least_privilege_workspace_storage_rls.sql). Service-role
 * routes that sign or list objects on a user's behalf must apply the same
 * rules, otherwise they widen what RLS allows. Keep both in sync: a change
 * to a root here needs the same change in SQL and in the pgTAP matrix
 * (supabase/tests/workspace-storage-least-privilege-rls.sql).
 *
 * Framework-independent: identity, membership, permission and chat lookups
 * are injected by the caller.
 */

export type WorkspaceStorageOperation =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete';

export type WorkspaceStoragePathClass =
  /** Drive object, including root-level files. */
  | { kind: 'drive'; wsId: string }
  /** `project-updates/**`: any workspace member. */
  | { kind: 'project-updates'; wsId: string }
  /** `template-backgrounds/**`: members read, Drive managers write. */
  | { kind: 'template-backgrounds'; wsId: string }
  /** `chat/<chatId>/**` or `chats/ai/resources/<chatId>/**`. */
  | { kind: 'ai-chat'; wsId: string; chatId: string }
  /** `chats/ai/resources/temp/<userId>/**`. */
  | { kind: 'ai-chat-temp'; wsId: string; userId: string }
  /** Application-owned private roots: service role only. */
  | { kind: 'private'; wsId: string };

export type WorkspaceStorageAccess = 'allowed' | 'forbidden' | 'invalid';

export interface WorkspaceStorageAccessContext {
  userId: string;
  /** MEMBER membership (guests are excluded, matching RLS). */
  isWorkspaceMember(wsId: string): Promise<boolean>;
  /** Drive permissions with creator/admin semantics of has_workspace_permission. */
  getDrivePermissions(
    wsId: string
  ): Promise<{ view: boolean; manage: boolean }>;
  /** Creator of an ai_chats row, or null when the chat does not exist. */
  getAiChatCreatorId(chatId: string): Promise<string | null>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roots that never fall back to Drive permissions (lower-cased). */
const SERVICE_ONLY_ROOTS = new Set([
  'external-apps',
  'ai agent imports',
  'recordings',
  '.tuturuuu',
]);

function decodeFully(value: string): string {
  let current = value;
  for (let pass = 0; pass < 5; pass += 1) {
    const decoded = current.replace(/%([\da-f]{2})/gi, (_match, byte: string) =>
      String.fromCharCode(Number.parseInt(byte, 16))
    );
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function classifyLiteral(name: string): WorkspaceStoragePathClass | null {
  const parts = name.split('/');
  const depth = parts.length;
  const [wsId] = parts;

  if (
    depth < 2 ||
    !wsId ||
    !UUID_PATTERN.test(wsId) ||
    parts.some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    return null;
  }

  // Root-level files (`<wsId>/<file>`) are Drive objects.
  const root = depth > 2 ? parts[1]!.toLowerCase() : null;

  if (
    (root && SERVICE_ONLY_ROOTS.has(root)) ||
    (root === 'mira' && parts[2]?.toLowerCase() === 'images' && depth >= 4)
  ) {
    return { kind: 'private', wsId };
  }

  if (root === 'chat') {
    const chatId = parts[2];
    return depth >= 4 && chatId && UUID_PATTERN.test(chatId)
      ? { kind: 'ai-chat', wsId, chatId }
      : { kind: 'private', wsId };
  }

  if (root === 'chats') {
    if (parts[2] !== 'ai' || parts[3] !== 'resources') {
      return { kind: 'private', wsId };
    }
    if (parts[4] === 'temp') {
      const userId = parts[5];
      return depth >= 7 && userId
        ? { kind: 'ai-chat-temp', wsId, userId }
        : { kind: 'private', wsId };
    }
    const chatId = parts[4];
    return depth >= 6 && chatId && UUID_PATTERN.test(chatId)
      ? { kind: 'ai-chat', wsId, chatId }
      : { kind: 'private', wsId };
  }

  if (root === 'project-updates') return { kind: 'project-updates', wsId };
  if (root === 'template-backgrounds') {
    return { kind: 'template-backgrounds', wsId };
  }
  return { kind: 'drive', wsId };
}

function sameClass(
  a: WorkspaceStoragePathClass,
  b: WorkspaceStoragePathClass
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Classifies a full object name (`<wsId>/...`). Returns null for names RLS
 * would never match: no workspace folder, or empty, `.` or `..` segments.
 *
 * Percent-encoded aliases are matched conservatively: when decoding changes
 * the name, the literal and decoded forms must classify identically,
 * otherwise the name is rejected. Transport encoding can never select a
 * different (weaker) rule.
 */
export function classifyWorkspaceStoragePath(
  name: string
): WorkspaceStoragePathClass | null {
  const literal = classifyLiteral(name);
  if (!literal) return null;
  const decoded = decodeFully(name);
  if (decoded === name) return literal;
  const decodedClass = classifyLiteral(decoded);
  return decodedClass && sameClass(literal, decodedClass) ? literal : null;
}

/**
 * Decides whether the actor may perform `operation` on object `name`, using
 * the same rules as the `workspaces` bucket RLS. Lookup failures propagate
 * as thrown errors so callers can answer 5xx instead of guessing.
 */
export async function resolveWorkspaceStorageAccess(
  name: string,
  operation: WorkspaceStorageOperation,
  context: WorkspaceStorageAccessContext
): Promise<WorkspaceStorageAccess> {
  const target = classifyWorkspaceStoragePath(name);
  if (!target) return 'invalid';
  if (target.kind === 'private') return 'forbidden';
  if (!(await context.isWorkspaceMember(target.wsId))) return 'forbidden';

  const readOrDelete = operation === 'select' || operation === 'delete';

  switch (target.kind) {
    case 'ai-chat': {
      if (!readOrDelete) return 'forbidden';
      const creatorId = await context.getAiChatCreatorId(target.chatId);
      return creatorId !== null && creatorId === context.userId
        ? 'allowed'
        : 'forbidden';
    }
    case 'ai-chat-temp':
      return readOrDelete && target.userId === context.userId
        ? 'allowed'
        : 'forbidden';
    case 'project-updates':
      return 'allowed';
    case 'template-backgrounds':
      if (operation === 'select') return 'allowed';
      return (await context.getDrivePermissions(target.wsId)).manage
        ? 'allowed'
        : 'forbidden';
    case 'drive': {
      const permissions = await context.getDrivePermissions(target.wsId);
      const allowed =
        operation === 'select'
          ? permissions.view || permissions.manage
          : permissions.manage;
      return allowed ? 'allowed' : 'forbidden';
    }
  }
}

/** Authorizes a folder listing as if reading any object directly inside it. */
export function resolveWorkspaceStorageFolderAccess(
  folder: string,
  operation: WorkspaceStorageOperation,
  context: WorkspaceStorageAccessContext
): Promise<WorkspaceStorageAccess> {
  return resolveWorkspaceStorageAccess(
    `${folder.replace(/\/+$/, '')}/object`,
    operation,
    context
  );
}

/** Caches lookups per workspace/chat for batch checks within one request. */
export function memoizeWorkspaceStorageAccessContext(
  context: WorkspaceStorageAccessContext
): WorkspaceStorageAccessContext {
  const members = new Map<string, Promise<boolean>>();
  const drive = new Map<string, Promise<{ view: boolean; manage: boolean }>>();
  const chats = new Map<string, Promise<string | null>>();
  const cached = <T>(
    map: Map<string, Promise<T>>,
    key: string,
    load: () => Promise<T>
  ) => {
    let value = map.get(key);
    if (!value) {
      value = load();
      map.set(key, value);
    }
    return value;
  };
  return {
    userId: context.userId,
    isWorkspaceMember: (wsId) =>
      cached(members, wsId, () => context.isWorkspaceMember(wsId)),
    getDrivePermissions: (wsId) =>
      cached(drive, wsId, () => context.getDrivePermissions(wsId)),
    getAiChatCreatorId: (chatId) =>
      cached(chats, chatId, () => context.getAiChatCreatorId(chatId)),
  };
}
