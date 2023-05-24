import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { EventParticipant } from '../../../../../../../../types/primitives/EventParticipant';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId, type } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    if (type && typeof type !== 'string') throw new Error('Invalid type');

    switch (req.method) {
      case 'GET':
        return await fetchParticipants(req, res, eventId, type);

      case 'POST':
        return await createParticipant(req, res, eventId, type);

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
  type?: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { query, page, itemsPerPage } = req.query;

  const platformParticipants = supabase
    .from('calendar_event_platform_participants')
    .select('*', { count: 'exact', head: true });

  const virtualParticipants = supabase
    .from('calendar_event_virtual_participants')
    .select('*', { count: 'exact', head: true });

  const queryBuilder = supabase
    .from('calendar_event_participants')
    .select('event_id, user_id, going, type, display_name, handle', {
      count: 'exact',
    })
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (type === 'platform') queryBuilder.eq('type', 'platform');
  if (type === 'virtual') queryBuilder.eq('type', 'virtual');

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

  const [
    platformParticipantsResponse,
    virtualParticipantsResponse,
    participantsResponse,
  ] = await Promise.all([
    platformParticipants,
    virtualParticipants,
    queryBuilder,
  ]);

  const { count, data, error } = participantsResponse;
  const { count: platform } = platformParticipantsResponse;
  const { count: virtual } = virtualParticipantsResponse;

  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({
    data,
    platform,
    virtual,
    count,
  } as {
    data: EventParticipant[];
    platform: number;
    virtual: number;
    count: number;
  });
};

const createParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  type?: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { user_id, role, going } = req.body as EventParticipant;

  const { data, error } = await supabase
    .from(
      type === 'virtual'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .insert({
      event_id: eventId,
      user_id,
      role,
      going,
    } as EventParticipant)
    .select('user_id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data as EventParticipant);
};
