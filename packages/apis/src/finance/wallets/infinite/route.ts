import { NextResponse } from 'next/server';
import type { FinanceRouteAuthContext } from '../../request-access';
import { GET as handleWalletsGET } from '../route';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type WalletRecord = Record<string, unknown>;

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getWalletName(wallet: WalletRecord) {
  return typeof wallet.name === 'string' ? wallet.name : '';
}

export async function GET(
  request: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const walletsResponse = await handleWalletsGET(
    request,
    { params: Promise.resolve({ wsId }) },
    authContext
  );

  if (!walletsResponse.ok) {
    return walletsResponse;
  }

  const wallets = (await walletsResponse.json()) as WalletRecord[];
  const { searchParams } = new URL(request.url);
  const limit = parseBoundedInteger(
    searchParams.get('limit'),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  );
  const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, 1e9);
  const normalizedQuery = searchParams.get('q')?.trim().toLowerCase();
  const filteredWallets = normalizedQuery
    ? wallets.filter((wallet) =>
        getWalletName(wallet).toLowerCase().includes(normalizedQuery)
      )
    : wallets;
  const data = filteredWallets.slice(offset, offset + limit);
  const nextOffset =
    offset + data.length < filteredWallets.length ? offset + data.length : null;

  return NextResponse.json({
    data,
    hasMore: nextOffset !== null,
    nextOffset,
    totalCount: filteredWallets.length,
  });
}
