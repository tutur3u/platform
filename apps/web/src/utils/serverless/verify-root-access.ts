import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ROOT_WORKSPACE_ID } from '../../constants/common';

export const verifyRootAccess = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> => {
  const supabase = createPagesServerClient({
    req,
    res,
  });

  const { error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', ROOT_WORKSPACE_ID)
    .single();

  if (error) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
};
