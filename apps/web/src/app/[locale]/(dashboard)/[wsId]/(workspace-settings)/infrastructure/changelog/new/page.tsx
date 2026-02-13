import { ArrowLeft } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
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
          <Link href={`/${wsId}/infrastructure/changelog`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-2xl">New Changelog Entry</h1>
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
