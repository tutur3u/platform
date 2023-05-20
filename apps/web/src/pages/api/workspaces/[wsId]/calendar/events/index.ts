import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CalendarEvent } from '../../../../../../types/primitives/CalendarEvent';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchEvents(req, res, wsId);

      case 'POST':
        return await createEvent(req, res, wsId);

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

const fetchEvents = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('workspace_calendar_events')
    .select('id, title, description, start_at, end_at, color, ws_id', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

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

  const sortedEvents = data.sort((a, b) => {
    if (a.start_at < b.start_at) return -1;
    if (a.start_at > b.start_at) return 1;
    if (a.end_at < b.end_at) return 1;
    if (a.end_at > b.end_at) return -1;
    return 0;
  });

  return res.status(200).json({
    data: sortedEvents,
    count,
  } as {
    data: CalendarEvent[];
    count: number;
  });
};

const createEvent = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { title, description, start_at, end_at, color } =
    req.body as CalendarEvent;

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .insert({
      title,
      description,
      start_at,
      end_at,
      color: color?.toUpperCase(),
      ws_id: wsId,
    } as CalendarEvent)
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
