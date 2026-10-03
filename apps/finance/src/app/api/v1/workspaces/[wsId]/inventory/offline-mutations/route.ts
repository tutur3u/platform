import { handleOfflineCreate } from '@tuturuuu/inventory-core/offline-create-route';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  return handleOfflineCreate(request, (await params).wsId);
}
