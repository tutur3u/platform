import {
  Archive,
  Inbox,
  PenLine,
  Send,
  Star,
  Trash2,
  TriangleAlert,
} from '@tuturuuu/icons';

export const MAIL_FOLDERS = [
  'inbox',
  'starred',
  'sent',
  'drafts',
  'archive',
  'spam',
  'trash',
] as const;

export type MailFolder = (typeof MAIL_FOLDERS)[number];

export const DEFAULT_MAIL_FOLDER = 'inbox' satisfies MailFolder;

export const mailFolderIcons = {
  archive: Archive,
  drafts: PenLine,
  inbox: Inbox,
  sent: Send,
  spam: TriangleAlert,
  starred: Star,
  trash: Trash2,
} satisfies Record<MailFolder, typeof Inbox>;

export function getMailFolderHref(personalOrWsId: string, folder: MailFolder) {
  return `/${personalOrWsId}/${folder}`;
}

export function isMailFolder(value: string): value is MailFolder {
  return (MAIL_FOLDERS as readonly string[]).includes(value);
}
