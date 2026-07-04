import { type NextRequest, NextResponse } from 'next/server';
import {
  approveHiveAccessRequest,
  getHiveAccessRequestById,
} from '@/lib/hive/hive-db';
import {
  hiveAccessRequestApprovalSchema,
  mapHiveAccessRequest,
  mapHiveMember,
  requireHiveAdmin,
  syncSupabaseHiveMember,
  withHiveRoute,
} from '../../../_shared';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  return withHiveRoute(
    request,
    '/api/v1/hive/access-requests/[requestId]/approve',
    async () => {
      const access = await requireHiveAdmin(request);

      if (!access.ok) {
        return access.response;
      }

      const { requestId } = await context.params;
      const payload = hiveAccessRequestApprovalSchema.parse(
        await request.json()
      );
      const accessRequest = await getHiveAccessRequestById(requestId);

      if (!accessRequest) {
        return NextResponse.json(
          { error: 'Hive access request not found' },
          { status: 404 }
        );
      }

      const notes =
        payload.notes ?? accessRequest.note ?? 'Approved from Platform Roles';
      const syncError = await syncSupabaseHiveMember(access.access.sbAdmin, {
        enabled: true,
        notes,
        userId: accessRequest.user_id,
      });

      if (syncError) {
        console.error('Failed to sync approved Hive member', {
          error: syncError.message,
          requestId,
          userId: accessRequest.user_id,
        });
        return NextResponse.json(
          { error: 'Failed to enable Hive satellite access' },
          { status: 500 }
        );
      }

      const approved = await approveHiveAccessRequest({
        approvedBy: access.access.user.id,
        notes,
        requestId,
      });

      if (!approved) {
        return NextResponse.json(
          { error: 'Failed to approve Hive access request' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        member: mapHiveMember(approved.member),
        request: mapHiveAccessRequest(approved.request),
      });
    }
  );
}
