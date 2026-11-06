'use client';
import dynamic from 'next/dynamic';

const Workbench = dynamic(
  () => import('./programming-workbench').then((m) => m.ProgrammingWorkbench),
  { ssr: false }
);
/** Standalone page host: the workbench fills the viewport below the app chrome. */
export function PlaygroundView({ projectId }: { projectId: string }) {
  return (
    <div className="h-[calc(100dvh-9rem)] min-h-[28rem]">
      <Workbench projectId={projectId} />
    </div>
  );
}
