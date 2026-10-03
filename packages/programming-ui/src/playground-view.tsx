'use client';
import dynamic from 'next/dynamic';

const Workbench = dynamic(
  () => import('./programming-workbench').then((m) => m.ProgrammingWorkbench),
  { ssr: false }
);
export function PlaygroundView({ projectId }: { projectId: string }) {
  return <Workbench projectId={projectId} />;
}
