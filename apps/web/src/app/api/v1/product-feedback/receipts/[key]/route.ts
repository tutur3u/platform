import { connection } from 'next/server';
import { readProductFeedbackReceipt } from '@/lib/user-feedbacks';

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> }
) {
  await connection();
  return readProductFeedbackReceipt(request, (await context.params).key);
}
