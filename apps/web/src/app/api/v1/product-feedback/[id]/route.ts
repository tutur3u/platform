import { connection } from 'next/server';
import { feedbackStaffService } from '../staff-service';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  return feedbackStaffService.detail(request, (await context.params).id);
}
