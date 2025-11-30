import type { JSONContent } from '@tiptap/react';
import { ArrowLeft } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChangelogForm } from '../changelog-form';

export const metadata: Metadata = {
  title: 'Edit Changelog Entry',
  description: 'Edit an existing changelog entry.',
};

interface Props {
  params: Promise<{
    wsId: string;
    id: string;
  }>;
}

const defaultContent: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
};

export default async function EditChangelogPage({ params }: Props) {
  const { wsId, id } = await params;

  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('manage_changelog')) {
    redirect(`/${wsId}/settings`);
  }

  const changelog = await getChangelog(id);

  if (!changelog) {
    notFound();
  }

  // Transform database content to JSONContent, falling back to default if null
  const transformedChangelog = {
    ...changelog,
    content: (changelog.content as JSONContent | null) ?? defaultContent,
    is_published: changelog.is_published ?? false,
  };

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
            <h1 className="font-bold text-2xl">Edit Changelog Entry</h1>
            <p className="text-foreground/80">
              Update the changelog entry details.
            </p>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <ChangelogForm wsId={wsId} initialData={transformedChangelog} isEditing />
    </>
  );
}

async function getChangelog(id: string) {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('changelog_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching changelog:', error);
    return null;
  }

  return data;
}
