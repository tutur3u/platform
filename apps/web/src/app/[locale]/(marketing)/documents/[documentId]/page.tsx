import { TailwindAdvancedEditor } from '@/app/[locale]/(dashboard)/[wsId]/documents/advanced-editor';
import { WorkspaceDocument } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/server';
import { Card } from '@repo/ui/components/ui/card';
import { notFound } from 'next/navigation';
import { JSONContent } from 'novel';

interface Props {
  params: Promise<{
    documentId: string;
  }>;
}

export default async function PublicDocumentPage({ params }: Props) {
  const { documentId } = await params;
  if (!documentId) notFound();

  const document = await getDocument(documentId);

  return (
    <div className="pb-32 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <Card className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">{document.name}</h1>
            </div>
          </div>

          <div className="bg-background/50 relative min-h-[500px] w-full rounded-lg border">
            <TailwindAdvancedEditor
              content={document.content as JSONContent ?? undefined}
              disableLocalStorage
              previewMode
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

const getDocument = async (documentId: string) => {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_documents')
    .select('*')
    .eq('id', documentId)
    .eq('is_public', true)
    .single();

  if (error) {
    console.error(error);
    notFound();
  }

  return data as WorkspaceDocument;
};
