import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { EventParticipant } from '../../../../../../../../types/primitives/EventParticipant';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId, userId, type } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    if (!userId || typeof userId !== 'string')
      throw new Error('Invalid userId');

    if (type && typeof type !== 'string') throw new Error('Invalid type');

    switch (req.method) {
      case 'GET':
        return await fetchParticipant(req, res, eventId, userId);

      case 'PUT': {
        return await updateParticipant(req, res, eventId, userId, type);
      }

      case 'DELETE': {
        return await deleteParticipant(req, res, eventId, userId, type);
      }

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

const fetchParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  userId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select('event_id, user_id, going, type, display_name, handle')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as EventParticipant);
};

const updateParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  userId: string,
  type?: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { role, going } = req.body as EventParticipant;

  const { error } = await supabase
    .from(
      type === 'virtual'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .update({
      role,
      going,
    } as EventParticipant)
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  userId: string,
  type?: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from(
      type === 'virtual'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
