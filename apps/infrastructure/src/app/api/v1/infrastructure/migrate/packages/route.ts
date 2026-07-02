import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

const normalizeManufacturerName = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const manufacturerKey = (wsId: string, name: string) => `${wsId}:${name}`;

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const supabase = await createAdminClient({ noCookie: true });
  const rows = (Array.isArray(json?.data) ? json.data : []) as Record<
    string,
    unknown
  >[];
  const manufacturerNamesByWorkspace = new Map<string, Set<string>>();

  for (const row of rows) {
    const wsId = typeof row.ws_id === 'string' ? row.ws_id : '';
    const manufacturerName = normalizeManufacturerName(
      row.manufacturer_name ?? row.manufacturer
    );

    if (!wsId || !manufacturerName) continue;

    const existingNames = manufacturerNamesByWorkspace.get(wsId) ?? new Set();
    existingNames.add(manufacturerName);
    manufacturerNamesByWorkspace.set(wsId, existingNames);
  }

  const manufacturers = [...manufacturerNamesByWorkspace.entries()].flatMap(
    ([wsId, names]) => [...names].map((name) => ({ ws_id: wsId, name }))
  );

  if (manufacturers.length > 0) {
    const manufacturerResult = await batchUpsert({
      table: 'inventory_manufacturers',
      schema: 'private',
      data: manufacturers,
      onConflict: 'ws_id,name',
      supabase,
    });

    if (!manufacturerResult.success) {
      return createMigrationResponse(
        manufacturerResult,
        'inventory-manufacturers'
      );
    }
  }

  const manufacturerIdsByKey = new Map<string, string>();
  const manufacturerNames = [
    ...new Set(manufacturers.map((manufacturer) => manufacturer.name)),
  ];
  const workspaceIds = [
    ...new Set(manufacturers.map((manufacturer) => manufacturer.ws_id)),
  ];

  if (workspaceIds.length > 0 && manufacturerNames.length > 0) {
    const { data, error } = await supabase
      .schema('private')
      .from('inventory_manufacturers')
      .select('id, ws_id, name')
      .in('ws_id', workspaceIds)
      .in('name', manufacturerNames);

    if (error) {
      serverLogger.error('Error resolving migrated manufacturers', error);
      return NextResponse.json(
        { message: 'Failed to resolve migrated manufacturers' },
        { status: 500 }
      );
    }

    for (const manufacturer of data ?? []) {
      manufacturerIdsByKey.set(
        manufacturerKey(manufacturer.ws_id, manufacturer.name),
        manufacturer.id
      );
    }
  }

  const productRows = rows.map((row) => {
    const {
      manufacturer: legacyManufacturer,
      manufacturer_name: manufacturerName,
      ...product
    } = row;
    const wsId = typeof product.ws_id === 'string' ? product.ws_id : '';
    const normalizedName = normalizeManufacturerName(
      manufacturerName ?? legacyManufacturer
    );

    if (normalizedName) {
      return {
        ...product,
        manufacturer_id: manufacturerIdsByKey.get(
          manufacturerKey(wsId, normalizedName)
        ),
      };
    }

    if (manufacturerName !== undefined || legacyManufacturer !== undefined) {
      return {
        ...product,
        manufacturer_id: null,
      };
    }

    return product;
  });

  const result = await batchUpsert({
    table: 'workspace_products',
    data: productRows,
    supabase,
  });
  return createMigrationResponse(result, 'packages');
}
