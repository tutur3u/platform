/**
 * Contact prefill from a message's From header. Names are split into a full
 * name and a short display name: Vietnamese names are surname first, so the
 * given name is the last word; other personal names use the first word.
 * Organisation-like names (brands, teams, mixed case, digits) have no full
 * name. Without a header name the local part only suggests a placeholder.
 */
export type SenderNameParts = {
  fullName: string;
  displayName: string;
  placeholder: string;
};

const VIETNAMESE_SURNAMES = new Set([
  'au',
  'bui',
  'cao',
  'chu',
  'dang',
  'dinh',
  'do',
  'doan',
  'duong',
  'ha',
  'hoang',
  'ho',
  'hua',
  'huynh',
  'khuc',
  'kieu',
  'la',
  'lam',
  'le',
  'luong',
  'luu',
  'ly',
  'mai',
  'ngo',
  'nguyen',
  'phan',
  'pham',
  'quach',
  'ta',
  'thai',
  'ton',
  'tong',
  'tran',
  'trinh',
  'truong',
  'vo',
  'vu',
  'vuong',
]);

const ORGANISATION_WORDS = new Set([
  'admin',
  'billing',
  'business',
  'co',
  'company',
  'corp',
  'group',
  'hr',
  'inc',
  'insights',
  'jsc',
  'llc',
  'ltd',
  'mail',
  'news',
  'newsletter',
  'noreply',
  'notifications',
  'sales',
  'support',
  'team',
  'cong',
  'ty',
]);

const GENERIC_LOCAL_PARTS = new Set([
  'admin',
  'billing',
  'contact',
  'hello',
  'help',
  'info',
  'mail',
  'news',
  'no-reply',
  'noreply',
  'notifications',
  'sales',
  'support',
  'team',
  'thongbao',
]);

function fold(word: string) {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z]/gu, '');
}

function capitalise(word: string) {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
}

function cleanHeaderName(raw: string | null | undefined) {
  let name = (raw ?? '')
    .trim()
    .replace(/^["'“]+|["'”]+$/gu, '')
    .replace(/_/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!name || name.includes('@')) return '';
  if (/\p{Lu}/u.test(name) && !/\p{Ll}/u.test(name))
    name = name.split(' ').map(capitalise).join(' ');
  return name;
}

function isVietnameseSurname(word: string) {
  return VIETNAMESE_SURNAMES.has(fold(word));
}

function looksLikeOrganisation(words: string[]) {
  return words.some(
    (word) =>
      /\d/u.test(word) ||
      /\p{Ll}\p{Lu}/u.test(word) ||
      ORGANISATION_WORDS.has(fold(word))
  );
}

function placeholderFromAddress(email: string) {
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return '';
  const words = local
    .split(/[._+-]+/u)
    .filter((word) => /^[a-z]+$/u.test(word) && word.length > 1);
  return words.length ? words.map(capitalise).join(' ') : '';
}

/** Full name, short display name and placeholder for a new contact. */
export function splitSenderName(
  headerName: string | null | undefined,
  email: string
): SenderNameParts {
  let name = cleanHeaderName(headerName);
  if (!name)
    return {
      fullName: '',
      displayName: '',
      placeholder: placeholderFromAddress(email),
    };

  const comma = name.split(',').map((part) => part.trim());
  if (comma.length === 2 && comma[0] && comma[1])
    name = isVietnameseSurname(comma[0])
      ? `${comma[0]} ${comma[1]}`
      : `${comma[1]} ${comma[0]}`;

  const words = name.split(' ');
  if (words.length < 2 || words.length > 5 || looksLikeOrganisation(words))
    return { fullName: '', displayName: name, placeholder: '' };

  const given = isVietnameseSurname(words[0]!) ? words.at(-1)! : words[0]!;
  return { fullName: name, displayName: given, placeholder: '' };
}

/** The one name the contact create API stores: the full name when known. */
export function senderContactName(parts: SenderNameParts) {
  return parts.fullName || parts.displayName;
}

/**
 * Workspace a new contact goes to by default: the mailbox's linked workspace,
 * then the route workspace (the personal workspace for a `personal` route).
 */
export function defaultContactWorkspaceId({
  mailboxWorkspaceId,
  routeWorkspaceId,
  workspaces,
}: {
  mailboxWorkspaceId?: string | null;
  routeWorkspaceId: string;
  workspaces?: readonly { id: string; personal?: boolean | null }[];
}) {
  if (mailboxWorkspaceId) return mailboxWorkspaceId;
  if (routeWorkspaceId === 'personal')
    return (
      workspaces?.find((workspace) => workspace.personal)?.id ??
      routeWorkspaceId
    );
  return routeWorkspaceId;
}
