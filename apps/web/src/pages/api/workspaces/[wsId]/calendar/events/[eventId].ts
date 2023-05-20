import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CalendarEvent } from '../../../../../../types/primitives/CalendarEvent';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { eventId } = req.query;

    if (!eventId || typeof eventId !== 'string')
      throw new Error('Invalid eventId');

    switch (req.method) {
      case 'GET':
        return await fetchCategory(req, res, eventId);

      case 'PUT': {
        return await updateCategory(req, res, eventId);
      }

      case 'DELETE': {
        return await deleteCategory(req, res, eventId);
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

const fetchCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string
) => {
  const supabase = createServerSupabaseClient({ req, res });

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select('id, title, description, start_at, end_at, color, ws_id')
    .eq('id', eventId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });

  return res.status(200).json(data as CalendarEvent);
};

const updateCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { title, description, start_at, end_at, color } =
    req.body as CalendarEvent;

  const { error } = await supabase
    .from('workspace_calendar_events')
    .update({
      title,
      description,
      start_at,
      end_at,
      color: color?.toUpperCase(),
    } as CalendarEvent)
    .eq('id', eventId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

const deleteCategory = async (
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspace_calendar_events')
    .delete()
    .eq('id', eventId);

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({});
};

export default handler;
