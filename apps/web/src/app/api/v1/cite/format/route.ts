import { handleCitationFormat } from '@/lib/cite/format-api';

export function POST(request: Request) {
  return handleCitationFormat(request);
}
