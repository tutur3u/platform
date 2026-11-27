import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { authorizeDraft, readDraft } from '@/lib/worlds/draft-store';
import { DraftLoadError, WorldEditor } from './world-editor';

type Props = { params: Promise<{ wsId: string }> };

export default function WorldsEditorPage({ params }: Props) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <AuthorizedEditor params={params} />
    </Suspense>
  );
}

async function EditorSkeleton() {
  const t = await getTranslations('worlds.editor');
  return (
    <LoadingRegion srLabel={t('loading')}>
      <div className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {['x', 'z', 'width', 'depth', 'elevation', 'heading'].map((field) => (
            <Skeleton key={field} className="h-14 w-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
    </LoadingRegion>
  );
}

async function AuthorizedEditor({ params }: Props) {
  await connection();

  const { wsId } = await params;
  const workspaceId = await authorizeDraft(wsId);
  if (!workspaceId) notFound();

  const result = await readDraft(workspaceId);
  if (result.status !== 'ok') return <DraftLoadError />;
  return (
    <WorldEditor key={workspaceId} wsId={workspaceId} initial={result.draft} />
  );
}
