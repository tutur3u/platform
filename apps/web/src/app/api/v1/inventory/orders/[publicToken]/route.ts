import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getCheckoutByPublicToken } from '@/lib/inventory/commerce/checkouts';
import {
  getSimulatedOrderResponse,
  isSimulatedOrderToken,
} from '@/lib/inventory/commerce/simulated-checkout';

interface Params {
  params: Promise<{ publicToken: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    if (isSimulatedOrderToken(publicToken)) {
      const simulatedOrder = getSimulatedOrderResponse(publicToken);
      if (simulatedOrder) {
        return NextResponse.json(simulatedOrder);
      }

      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const order = await getCheckoutByPublicToken(publicToken);

    if (!order) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    serverLogger.error('Failed to load public inventory order', error);
    return NextResponse.json(
      { message: 'Failed to load order' },
      { status: 500 }
    );
  }
}
