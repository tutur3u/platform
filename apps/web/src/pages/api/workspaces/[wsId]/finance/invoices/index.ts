import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Invoice } from '../../../../../../types/primitives/Invoice';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { wsId } = req.query;

    if (!wsId || typeof wsId !== 'string') throw new Error('Invalid wsId');

    switch (req.method) {
      case 'GET':
        return await fetchInvoices(req, res, wsId);

      case 'POST':
        return await createInvoice(req, res, wsId);

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

const fetchInvoices = async (
  req: NextApiRequest,
  res: NextApiResponse,
  wsId: string
) => {
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const { status, query, page, itemsPerPage } = req.query;

  const queryBuilder = supabase
    .from('finance_invoices')
    .select(
      'id, customer_id, creator_id, price, price_diff, note, notice, transaction_id, completed_at, created_at'
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (status === 'completed') queryBuilder.not('completed_at', 'is', null);
  else if (status === 'incomplete') queryBuilder.is('completed_at', null);

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

const createInvoice = async (
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
    customer_id,
    price,
    price_diff,
    notice,
    note,
    completed_at,
    transaction_id,
  } = req.body as Invoice;

  const { data, error } = await supabase
    .from('finance_invoices')
    .insert({
      customer_id: customer_id || null,
      price,
      price_diff,
      notice,
      note,
      creator_id: user.id,
      completed_at: completed_at ? 'now()' : null,
      ws_id: wsId,
      transaction_id,
    })
    .select('id')
    .single();

  if (error) return res.status(401).json({ error: error.message });
  return res.status(200).json({ id: data.id });
};
