import { connection } from 'next/server';
import { feedbackStaffService } from './staff-service';

export async function GET(request: Request) {
  await connection();
  return feedbackStaffService.list(request);
}

export { submitProductFeedbackRequest as POST } from '@/lib/user-feedbacks';
