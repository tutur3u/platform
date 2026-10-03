import { PlaygroundView } from '@tuturuuu/programming-ui/playground-view';
import { connection } from 'next/server';
import { z } from 'zod';
export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await connection();
  const { projectId } = await params;
  return (
    <PlaygroundView key={projectId} projectId={z.guid().parse(projectId)} />
  );
}
