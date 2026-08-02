import { connection } from 'next/server';
import { ExternalChatMigrationLab } from './migration-lab';

export default async function ExternalChatLabPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  return <ExternalChatMigrationLab wsId={wsId} />;
}
