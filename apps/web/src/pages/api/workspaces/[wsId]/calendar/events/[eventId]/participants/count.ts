import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    switch (req.method) {
      case 'GET':
        return await fetchCount(req, res, eventId);

      default:
        throw new Error(
          `The HTTP ${req.method} method is not supported at this route.`
        );
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: {
        message: 'Something went wrong',
      },
    });
  }
};

export default handler;

const fetchCount = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const platformParticipants = supabase
    .from('calendar_event_platform_participants')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  const virtualParticipants = supabase
    .from('calendar_event_virtual_participants')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  const participantGroups = supabase
    .from('calendar_event_participant_groups')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  const pendingParticipants = supabase.rpc('get_pending_event_participants', {
    _event_id: eventId,
  });

  const goingParticipants = supabase
    .from('calendar_event_participants')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('type', 'user_group')
    .eq('going', true);

  const notGoingParticipants = supabase
    .from('calendar_event_participants')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('type', 'user_group')
    .eq('going', false);

  const [
    platformParticipantsResponse,
    virtualParticipantsResponse,
    participantGroupsResponse,
    pendingParticipantsResponse,
    goingParticipantsResponse,
    notGoingParticipantsResponse,
  ] = await Promise.all([
    platformParticipants,
    virtualParticipants,
    participantGroups,
    pendingParticipants,
    goingParticipants,
    notGoingParticipants,
  ]);

  const { count: not_going } = notGoingParticipantsResponse;
  const { count: platform } = platformParticipantsResponse;
  const { count: virtual } = virtualParticipantsResponse;
  const { data: pending } = pendingParticipantsResponse;
  const { count: groups } = participantGroupsResponse;
  const { count: going } = goingParticipantsResponse;

  if (
    not_going === null ||
    platform === null ||
    virtual === null ||
    pending === null ||
    groups === null ||
    going === null
  )
    throw new Error('Something went wrong');

  return res.status(200).json({
    platform,
    virtual,
    pending,
    groups,
    going,
    not_going,
  } as {
    platform: number;
    virtual: number;
    pending: number;
    groups: number;
    going: number;
    not_going: number;
  });
};
