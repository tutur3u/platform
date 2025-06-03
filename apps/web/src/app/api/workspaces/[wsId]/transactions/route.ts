import { createClient } from '@ncthub/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Parse the request URL
  const url = new URL(req.url);

  // Extract query parameters
  const activePage = url.searchParams.get('page');
  const itemsPerPage = url.searchParams.get('itemsPerPage');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .range(
      (Number(activePage) - 1) * Number(itemsPerPage),
      Number(itemsPerPage)
    )
    .order('taken_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const data =
    // : Transaction & {
    //   origin_wallet_id?: string;
    //   destination_wallet_id?: string;
    // }
    await req.json();

  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  delete newData.destination_wallet_id;

  const { error } = await supabase
    .from('wallet_transactions')
    .upsert(newData)
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
