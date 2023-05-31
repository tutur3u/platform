import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  EventParticipant,
  EventParticipantType,
} from '../../../../../../../../types/primitives/EventParticipant';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId, participantId, type } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    if (!participantId || typeof participantId !== 'string')
      throw new Error('Invalid participantId');

    if (type && typeof type !== 'string') throw new Error('Invalid type');

    switch (req.method) {
      case 'GET':
        return await fetchParticipant(req, res, eventId, participantId);

      case 'PUT': {
        return await updateParticipant(
          req,
          res,
          eventId,
          participantId,
          type as EventParticipantType
        );
      }

      case 'DELETE': {
        return await deleteParticipant(
          req,
          res,
          eventId,
          participantId,
          type as EventParticipantType
        );
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
  participantId: string
) => {
  const supabase = createPagesServerClient({ req, res });

  const { data, error } = await supabase
    .from('calendar_event_participants')
    .select('going')
    .eq('event_id', eventId)
    .eq('participant_id', participantId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as EventParticipant);
};

const updateParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  participantId: string,
  type?: EventParticipantType
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { role, going } = req.body as EventParticipant;

  const { error } = await supabase
    .from(
      type === 'user_group'
        ? 'calendar_event_participant_groups'
        : type === 'virtual_user'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .update({
      role,
      going,
    } as EventParticipant)
    .eq('event_id', eventId)
    .eq(type === 'user_group' ? 'group_id' : 'user_id', participantId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteParticipant = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  participantId: string,
  type?: EventParticipantType
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from(
      type === 'user_group'
        ? 'calendar_event_participant_groups'
        : type === 'virtual_user'
        ? 'calendar_event_virtual_participants'
        : 'calendar_event_platform_participants'
    )
    .delete()
    .eq('event_id', eventId)
    .eq(type === 'user_group' ? 'group_id' : 'user_id', participantId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
