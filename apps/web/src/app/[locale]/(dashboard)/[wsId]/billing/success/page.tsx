import ClientComponent from './client-component';

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { wsId } = await params;

  return <ClientComponent wsId={wsId} />;
}
