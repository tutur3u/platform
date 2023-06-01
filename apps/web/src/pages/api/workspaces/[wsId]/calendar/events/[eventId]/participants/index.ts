import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  EventParticipant,
  EventParticipantType,
} from '../../../../../../../../types/primitives/EventParticipant';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId, type } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    if (type && typeof type !== 'string') throw new Error('Invalid type');

    switch (req.method) {
      case 'GET':
        return await fetchParticipants(
          req,
          res,
          eventId,
          type as EventParticipantType
        );

      case 'POST':
        return await createParticipant(
          req,
          res,
          eventId,
          type as EventParticipantType
        );

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

const fetchParticipants = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  type?: EventParticipantType
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('calendar_event_participants')
    .select('event_id, participant_id, type, display_name, handle', {
      count: 'exact',
    })
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (
    type === 'platform_user' ||
    type === 'virtual_user' ||
    type === 'user_group'
  )
    queryBuilder.eq('type', type);
  else queryBuilder.neq('type', 'user_group');

  if (query) {
    queryBuilder.ilike('description', `%${query}%`);
  }

  if (
    page &&
    itemsPerPage &&
    typeof page === 'string' &&
    typeof itemsPerPage === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(itemsPerPage);

    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { count, data, error } = await queryBuilder;
  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({
    data,
    count,
  } as {
    data: EventParticipant[];
    count: number;
  });
};

const createParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  type?: EventParticipantType
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { participant_id, role, going } = req.body as EventParticipant;

  const { data, error } = await supabase
    .from(
      type === 'user_group'
        ? 'calendar_event_participant_groups'
        : type === 'virtual_user'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .insert({
      event_id: eventId,
      user_id: type !== 'user_group' ? participant_id : undefined,
      group_id: type === 'user_group' ? participant_id : undefined,
      role,
      going,
    })
    .select(
      type === 'user_group'
        ? 'participant_id:group_id'
        : 'participant_id:user_id'
    )
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data as EventParticipant);
};
