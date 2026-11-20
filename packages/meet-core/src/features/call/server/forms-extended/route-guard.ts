import 'server-only';
import { roomRoute } from '../room-service';

export function meetExtendedFormsRoute(
  ...arguments_: Parameters<typeof roomRoute>
) {
  if (
    process.env.MEET_FORMS_ENABLED !== 'true' ||
    process.env.MEET_FORMS_EXTENDED_ENABLED !== 'true'
  ) {
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return roomRoute(...arguments_);
}
