import { createLegacyHeadHandler } from '@/lib/legacy-head';
import {
  changeFeedback,
  createFeedback,
  listFeedbacks,
} from '@/lib/user-feedbacks';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  return listFeedbacks(request, await params);
}

export const HEAD = createLegacyHeadHandler(GET);

export async function POST(request: Request, { params }: Params) {
  return createFeedback(request, await params);
}

export async function PUT(request: Request, { params }: Params) {
  return changeFeedback(request, await params, 'PUT');
}

export async function DELETE(request: Request, { params }: Params) {
  return changeFeedback(request, await params, 'DELETE');
}
