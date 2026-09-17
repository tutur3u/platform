import { forwardPromotionMutation } from '@/lib/promotion-mutations';

interface Context {
  params: Promise<{ wsId: string; promotionId: string }>;
}
export async function PUT(request: Request, { params }: Context) {
  const { wsId, promotionId } = await params;
  return forwardPromotionMutation(request, wsId, promotionId);
}
export async function DELETE(request: Request, { params }: Context) {
  const { wsId, promotionId } = await params;
  return forwardPromotionMutation(request, wsId, promotionId);
}
