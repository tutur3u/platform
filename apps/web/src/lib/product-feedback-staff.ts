import { headers } from 'next/headers';
import { feedbackStaffService } from '@/app/api/v1/product-feedback/staff-service';

export async function getFeedbackStaffIdentity() {
  if (process.env.PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED !== 'true') return null;
  const request = new Request(
    'https://feedback.internal/api/v1/product-feedback/eligibility',
    { headers: await headers() }
  );
  return (await feedbackStaffService.identity(request)).actor;
}
