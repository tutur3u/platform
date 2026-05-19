import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { isInventoryEnabled } from '@/lib/inventory/access';
import { getPublicStorefront } from '@/lib/inventory/commerce/public-storefront';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const payload = await getPublicStorefront(slug);

    if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    serverLogger.error('Failed to load public inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to load storefront' },
      { status: 500 }
    );
  }
}
