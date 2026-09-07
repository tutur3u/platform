import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { canCreateOnlineMeeting } from '@tuturuuu/utils/meet-creation-policy';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
  WorkspaceNotFoundError,
} from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import {
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

const ScheduleSchema = z.object({
  endTime: z.iso.datetime({ offset: true }),
});

const CreateMeetingSchema = z.object({
  name: z.string().trim().min(1).max(255),
  time: z.iso.datetime({ offset: true }),
  schedule: ScheduleSchema.optional(),
});

function buildMeetingDetailUrl(workspaceId: string, meetingId: string) {
  return `${getMeetAppOrigin()}/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}`;
}

function buildCalendarEventUrl(
  workspaceId: string,
  eventId: string,
  startAt: string
) {
  const url = new URL(
    `/${encodeURIComponent(workspaceId)}`,
    getCalendarAppOrigin()
  );
  url.searchParams.set('date', startAt);
  url.searchParams.set('eventId', eventId);
  return url.toString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  try {
    const { wsId: rawWsId } = await params;
    // Accepts the Meet satellite's app-session token as well as a Supabase
    // cookie. Satellites never send Supabase cookies, so cookie-only auth here
    // made every proxied meetings request 401.
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { supabase, user } = auth;

    // 'personal' and other aliases are not UUIDs, so the membership lookup
    // errors out and reports membership_lookup_failed instead of a real answer.
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

    if (Number.isNaN(page) || page < 1) {
      return NextResponse.json(
        { error: 'Invalid page parameter' },
        { status: 400 }
      );
    }

    if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: 'Invalid pageSize parameter (must be between 1 and 100)' },
        { status: 400 }
      );
    }

    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get('search') || '';

    // Build the query
    let query = supabase
      .from('workspace_meetings')
      .select(
        `
        *,
        creator:users!workspace_meetings_creator_id_fkey(
          display_name
        ),
        recording_sessions(
          id,
          status,
          created_at,
          updated_at
        )
      `,
        { count: 'exact' }
      )
      .eq('ws_id', wsId)
      .order('time', { ascending: false });

    // Add search filter if provided
    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const {
      data: meetings,
      error,
      count,
    } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching meetings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch meetings' },
        { status: 500 }
      );
    }

    let meetingsWithCalendar = meetings || [];
    if (meetingsWithCalendar.length > 0) {
      const { data: hasCalendarPermission } = await supabase.rpc(
        'has_workspace_permission',
        {
          p_ws_id: wsId,
          p_user_id: user.id,
          p_permission: 'manage_calendar',
        }
      );

      if (hasCalendarPermission) {
        const meetingIds = meetingsWithCalendar.map((meeting) => meeting.id);
        const admin = await createAdminClient({ noCookie: true });
        const { data: calendarEvents, error: calendarError } = await admin
          .from('workspace_calendar_events')
          .select('id, start_at, end_at, scheduling_metadata')
          .eq('ws_id', wsId)
          .in('scheduling_metadata->>meeting_id', meetingIds);

        if (calendarError) {
          console.warn('Failed to load meeting Calendar links', {
            wsId,
            error: calendarError,
          });
        } else {
          const calendarByMeetingId = new Map(
            (calendarEvents ?? []).flatMap((event) => {
              const metadata = event.scheduling_metadata;
              if (
                !metadata ||
                typeof metadata !== 'object' ||
                Array.isArray(metadata) ||
                metadata.type !== 'tuturuuu_meeting' ||
                typeof metadata.meeting_id !== 'string'
              ) {
                return [];
              }
              return [
                [
                  metadata.meeting_id,
                  {
                    id: event.id,
                    start_at: event.start_at,
                    end_at: event.end_at,
                    url: buildCalendarEventUrl(
                      rawWsId,
                      event.id,
                      event.start_at
                    ),
                  },
                ] as const,
              ];
            })
          );
          meetingsWithCalendar = meetingsWithCalendar.map((meeting) => ({
            ...meeting,
            calendar_event: calendarByMeetingId.get(meeting.id) ?? null,
          }));
        }
      }
    }

    return NextResponse.json({
      meetings: meetingsWithCalendar,
      totalCount: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    // Accepts the Meet satellite's app-session token as well as a Supabase
    // cookie. Satellites never send Supabase cookies, so cookie-only auth here
    // made every proxied meetings request 401.
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { supabase, user } = auth;

    if (!canCreateOnlineMeeting(user.email)) {
      return NextResponse.json(
        {
          error: 'Only @tuturuuu.com accounts can create online meetings.',
          code: 'MEET_CREATION_RESTRICTED',
        },
        { status: 403 }
      );
    }

    // Handoff session metadata is not an authority for the creator domain.
    const admin = await createAdminClient({ noCookie: true });
    const { data: identity, error: identityError } =
      await admin.auth.admin.getUserById(user.id);
    if (identityError) {
      return NextResponse.json(
        { error: 'Failed to verify creator account' },
        { status: 503 }
      );
    }
    if (
      !identity.user?.email_confirmed_at ||
      !canCreateOnlineMeeting(identity.user.email)
    ) {
      return NextResponse.json(
        {
          error: 'Only verified Tuturuuu accounts can create meetings',
          code: 'MEET_CREATION_RESTRICTED',
        },
        { status: 403 }
      );
    }

    // Also guards the insert below: 'personal' is not a valid ws_id value.
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const parsed = CreateMeetingSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid meeting name or time' },
        { status: 400 }
      );
    }
    const { name, time, schedule } = parsed.data;

    if (schedule && new Date(schedule.endTime) <= new Date(time)) {
      return NextResponse.json(
        { error: 'Meeting end time must be after its start time' },
        { status: 400 }
      );
    }

    if (schedule) {
      const { data: hasCalendarPermission, error: permissionError } =
        await supabase.rpc('has_workspace_permission', {
          p_ws_id: wsId,
          p_user_id: user.id,
          p_permission: 'manage_calendar',
        });

      if (permissionError) {
        console.error('Failed to verify calendar permission', {
          wsId,
          error: permissionError,
        });
        return NextResponse.json(
          { error: 'Failed to verify calendar permission' },
          { status: 500 }
        );
      }

      if (!hasCalendarPermission) {
        return NextResponse.json(
          {
            error: 'You do not have permission to schedule calendar events',
            code: 'CALENDAR_PERMISSION_REQUIRED',
          },
          { status: 403 }
        );
      }
    }

    if (schedule) {
      const meetingId = crypto.randomUUID();
      const meetingUrl = buildMeetingDetailUrl(rawWsId, meetingId);
      const workspaceKey = await getWorkspaceKey(wsId);
      const encryptedFields = await encryptEventForStorage(
        wsId,
        {
          title: name,
          description: meetingUrl,
          location: meetingUrl,
        },
        workspaceKey
      );
      const { data: scheduledResult, error: schedulingError } = await admin.rpc(
        'create_scheduled_workspace_meeting',
        {
          p_meeting_id: meetingId,
          p_ws_id: wsId,
          p_creator_id: user.id,
          p_name: name,
          p_start_at: time,
          p_end_at: schedule.endTime,
          p_encrypted_title: encryptedFields.title,
          p_encrypted_description: encryptedFields.description,
          p_encrypted_location: encryptedFields.location,
          p_is_encrypted: encryptedFields.is_encrypted,
          p_meeting_url: meetingUrl,
        }
      );

      if (schedulingError || !scheduledResult) {
        console.error('Failed to schedule meeting on Calendar', {
          wsId,
          error: schedulingError,
        });
        return NextResponse.json(
          { error: 'Failed to schedule meeting on Calendar' },
          { status: 500 }
        );
      }

      const result = scheduledResult as unknown as {
        meeting: { id: string };
        calendar_event: { id: string; start_at: string; end_at: string };
      };
      return NextResponse.json({
        meeting: result.meeting,
        calendarEvent: {
          ...result.calendar_event,
          url: buildCalendarEventUrl(rawWsId, result.calendar_event.id, time),
        },
      });
    }

    // Instant meetings do not create Calendar events.
    const { data: meeting, error } = await supabase
      .from('workspace_meetings')
      .insert({
        ws_id: wsId,
        name,
        time,
        creator_id: user.id,
      })
      .select(
        `
        *,
        creator:users!workspace_meetings_creator_id_fkey(
          display_name
        )
      `
      )
      .single();

    if (error || !meeting) {
      console.error('Error creating meeting:', error);
      return NextResponse.json(
        { error: 'Failed to create meeting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
