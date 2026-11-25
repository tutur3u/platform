import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import {
  getDocumentsAppEntryTarget,
  getDocumentsAppLoginTarget,
} from '@/lib/documents-app-entry';

export const metadata: Metadata = {
  title: 'Documents',
  robots: NO_INDEX_ROBOTS,
};

/**
 * Apex entry for the Documents app (`tuturuuu.com/docs`). It resolves the
 * signed-in user's default workspace and opens its Documents. The workspace
 * deep links (`/<wsId>/documents`) keep working unchanged. Signed-out visitors
 * are normally sent to login by the auth proxy; this is the same fallback.
 */
export default async function DocumentsAppEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();

  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(getDocumentsAppLoginTarget(locale));

  const workspace = await getUserDefaultWorkspace();
  redirect(getDocumentsAppEntryTarget(workspace, locale));
}
