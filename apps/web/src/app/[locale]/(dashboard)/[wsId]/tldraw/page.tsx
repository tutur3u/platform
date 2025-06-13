import { CustomTldraw } from './custom-tldraw';

export default async function TLDrawPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;

  return (
    <div className="absolute inset-0">
      <CustomTldraw persistenceKey={wsId} />
    </div>
  );
}
