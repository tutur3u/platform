import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import {
  removeUnreferencedTaskMedia,
  taskMediaFilename,
} from '@/lib/task-media-cleanup';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Cron secret is not configured' },
      { status: 500 }
    );
  }
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createAdminClient();
  const bucket = admin.storage.from('workspaces');
  const cutoff = Date.now() - RETENTION_MS;
  let checked = 0;
  let deleted = 0;
  let failed = 0;

  async function listAll(prefix: string) {
    const entries = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      entries.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return entries;
  }

  async function inspect(prefix: string) {
    for (const entry of await listAll(prefix)) {
      const path = `${prefix}/${entry.name}`;
      if (!entry.id) {
        await inspect(path);
        continue;
      }
      if (!taskMediaFilename(path) || !entry.created_at) continue;
      const createdAt = Date.parse(entry.created_at);
      if (!Number.isFinite(createdAt) || createdAt > cutoff) continue;
      checked++;
      try {
        if (await removeUnreferencedTaskMedia(admin, path)) deleted++;
      } catch (error) {
        failed++;
        console.error('Failed to inspect task media:', error);
      }
    }
  }

  try {
    for (const workspace of await listAll('')) {
      if (!/^[0-9a-f-]{36}$/i.test(workspace.name) || workspace.id) continue;
      try {
        await inspect(`${workspace.name}/task-images`);
      } catch (error) {
        failed++;
        console.error('Failed to list task media for workspace:', error);
      }
    }
    return NextResponse.json(
      { checked, deleted, failed },
      { status: failed ? 500 : 200 }
    );
  } catch (error) {
    console.error('Failed to clean up orphan task media:', error);
    return NextResponse.json(
      { error: 'Failed to clean up orphan task media', checked, deleted },
      { status: 500 }
    );
  }
}
