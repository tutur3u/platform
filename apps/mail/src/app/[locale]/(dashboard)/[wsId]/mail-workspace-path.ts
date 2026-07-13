import { isMailFolder, type MailFolder } from './mail-folders';

export function getMailFolderFromPathname(pathname: string): MailFolder | null {
  const value = pathname.split('/').filter(Boolean).at(-1);
  return value && isMailFolder(value) ? value : null;
}
