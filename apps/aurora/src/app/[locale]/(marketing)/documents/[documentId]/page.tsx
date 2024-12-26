import DocumentPageContent from './document-content';
import { createAdminClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    documentId: string;
  }>;
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
    console.error('Error:', error);
    notFound();
  }

  if (!data) {
    console.error('Document not found');
    notFound();
  }

  return data;
};

export default async function PublicDocumentPage({ params }: Props) {
  const { documentId } = await params;
  if (!documentId) notFound();

  const document = await getDocument(documentId);
  return <DocumentPageContent document={document} />;
}