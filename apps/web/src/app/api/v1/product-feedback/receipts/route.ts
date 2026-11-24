import { connection } from 'next/server';
import { listProductFeedbackReceipts } from '@/lib/user-feedbacks';

export async function GET(request: Request) {
  await connection();
  return listProductFeedbackReceipts(request);
}
