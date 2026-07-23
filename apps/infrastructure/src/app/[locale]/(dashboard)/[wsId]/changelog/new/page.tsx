import { ArrowLeft } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ChangelogForm } from '../changelog-form';

export const metadata: Metadata = {
  title: 'New Changelog Entry',
  description: 'Create a new changelog entry.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function NewChangelogPage({ params }: Props) {
  await connection();

  const { wsId } = await params;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_changelog')) {
    redirect(`/${wsId}/settings`);
  }

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div className="flex items-center gap-4">
          <Link
            aria-labelledby="new-changelog-heading"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/${wsId}/changelog`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
          <div>
            <h1 className="font-bold text-2xl" id="new-changelog-heading">
              New Changelog Entry
            </h1>
            <p className="text-foreground/80">
              Create a new entry for the platform changelog.
            </p>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <ChangelogForm wsId={wsId} />
    </>
  );
}
