import { connection } from 'next/server';
import { readProductFeedbackStaffMedia } from '@/lib/product-feedback-service';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  return readProductFeedbackStaffMedia(request, (await context.params).id);
}
