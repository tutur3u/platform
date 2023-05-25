import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { VitalGroup } from '../../../../../../types/primitives/VitalGroup';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchVitalGroups(req, res, wsId);

      case 'POST':
        return await createVitalGroup(req, res, wsId);

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

const fetchVitalGroups = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('healthcare_vital_groups')
    .select('id, name, description, note')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

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
  return res.status(200).json(data);
};

const createVitalGroup = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { name, description, note } = req.body as VitalGroup;

  const { data, error } = await supabase
    .from('healthcare_vital_groups')
    .insert({
      name,
      description,
      note,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
