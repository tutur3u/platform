import { handleCitationValidate } from '@/lib/cite/format-api';

export function POST(request: Request) {
  return handleCitationValidate(request);
}
