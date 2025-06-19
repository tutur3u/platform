import { CustomTldraw } from './custom-tldraw';

export default async function TLDrawPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  return (
    <div className="absolute inset-0">
      <CustomTldraw persistenceKey={boardId} />
    </div>
  );
}
