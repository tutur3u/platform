import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { joinPath } from '@tuturuuu/utils/path-helper';
import 'dayjs/locale/vi';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TransactionDetailsClientPage } from './transaction-details-client-page';

interface Props {
  params: Promise<{
    wsId: string;
    transactionId: string;
    locale: string;
  }>;
}

export default async function TransactionDetailsPage({ params }: Props) {
  const { wsId, transactionId } = await params;

  const t = await getTranslations();
  const { objects, transaction, tags } = await getData(wsId, transactionId);

  if (!transaction) notFound();

  return (
    <div className="flex min-h-full w-full flex-col">
      <FeatureSummary
        pluralTitle={transaction.category || t('ws-transactions.plural')}
        singularTitle={transaction.category || t('ws-transactions.singular')}
        description={
          transaction.description || t('ws-transactions.description')
        }
        createTitle={t('ws-transactions.create')}
        createDescription={t('ws-transactions.create_description')}
      />
      <Separator className="my-4" />

      <TransactionDetailsClientPage
        wsId={wsId}
        transaction={transaction}
        tags={tags}
        objects={objects}
      />
    </div>
  );
}

async function getData(wsId: string, transactionId: string) {
  const supabase = await createClient();

  const { data: rawTransaction, error: transactionError } = await supabase
    .from('wallet_transactions')
    .select(
      '*, transaction_categories(category:name), workspace_wallets(wallet_name:name), workspace_users!wallet_transactions_creator_id_fkey(id, full_name, avatar_url, email)'
    )
    .eq('id', transactionId)
    .single();

  if (transactionError) throw transactionError;

  // Flatten the nested data for easier access
  const transaction = {
    ...rawTransaction,
    category: (rawTransaction as any).transaction_categories?.category,
    wallet_name: (rawTransaction as any).workspace_wallets?.wallet_name,
  };

  // Fetch tags for this transaction
  const { data: transactionTags } = await supabase
    .from('wallet_transaction_tags')
    .select('tag_id, transaction_tags(id, name, color)')
    .eq('transaction_id', transactionId);

  const tags =
    transactionTags?.map((tt: any) => tt.transaction_tags).filter(Boolean) ||
    [];

  const { data: objects, error: objectError } = await supabase.storage
    .from('workspaces')
    .list(joinPath(wsId, 'finance/transactions', transactionId));

  if (objectError) throw objectError;

  const imageObjects = objects.filter((object) =>
    object.metadata.mimetype.includes('image')
  );

  // batch signed to reduce network calls
  const { data: previews, error: previewError } = imageObjects.length
    ? await supabase.storage.from('workspaces').createSignedUrls(
        imageObjects.map((object) =>
          joinPath(wsId, 'finance/transactions', transactionId, object.name)
        ),
        // TODO: externalize expiresIn params, currently 5 minutes
        3600
      )
    : { data: [], error: undefined };

  if (previewError) throw previewError;

  // assign preview-able objects results to objects' metadata
  Object.assign(
    objects,
    objects.map((object) => ({
      ...object,
      metadata: {
        ...object.metadata,
        preview: previews?.find(
          (preview) => preview?.path?.split('/').pop() === object.name
        ),
      },
    }))
  );

  return { objects, transaction, previews, tags };
}
