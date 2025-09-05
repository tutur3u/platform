import NewInvoicePage from './new-invoice-page';

interface Props {
  wsId: string;
}

export default async function NewInvoiceWrapper({ wsId }: Props) {
  return <NewInvoicePage wsId={wsId} />;
}
