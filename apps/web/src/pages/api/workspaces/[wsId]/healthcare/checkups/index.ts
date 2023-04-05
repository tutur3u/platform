import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Checkup } from '../../../../../../types/primitives/Checkup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchCheckups(req, res, wsId);

      case 'POST':
        return await createCheckup(req, res, wsId);

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

const fetchCheckups = async (
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
    .from('healthcare_checkups')
    .select(
      'id, user_id, diagnosis_id, note, checked, checkup_at, next_checked, next_checkup_at, completed_at, creator_id, created_at'
    )
    .eq('ws_id', wsId)
    .order('created_at');

  if (query) {
    queryBuilder.ilike('name', `%${query}%`);
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

  const { data, error } = await queryBuilder;

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json(data as Checkup[]);
};

const createCheckup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const {
    user_id,
    diagnosis_id,
    note,
    checked,
    checkup_at,
    next_checked,
    next_checkup_at,
  } = req.body as Checkup;

  const { data, error } = await supabase
    .from('healthcare_checkups')
    .insert({
      user_id,
      diagnosis_id,
      note,
      checked,
      checkup_at,
      next_checked,
      next_checkup_at,
      completed_at:
        checked && (next_checked || !next_checkup_at) ? 'now()' : null,
      ws_id: wsId,
      creator_id: user.id,
    } as Checkup)
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
