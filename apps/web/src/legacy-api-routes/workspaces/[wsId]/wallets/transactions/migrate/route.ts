import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const data = await req.json();

  const { error } = await supabase.from('wallet_transactions').upsert(
    data?.transactions.map(({ _id, ...rest }: { _id: string }) => ({
      ...rest,
    })) || []
  );

  if (error) {
    serverLogger.error('Error migrating workspace transactions:', error);
    return NextResponse.json(
      { message: 'Error migrating workspace transactions' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
