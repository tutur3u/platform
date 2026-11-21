import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type FleetDigestSection,
  fleetDigestSectionSchema,
  fleetStoredDigestSectionSchema,
  summarizeFleetDigest,
} from '@tuturuuu/internal-api/fleet';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';
import { connection, NextResponse } from 'next/server';
import { fleetJson, withFleetSession } from '../session';

const publisherBearer = /^Bearer (ttr_fleet_digest_[A-Za-z0-9_-]{43})$/i;
const publisherHash = /^[0-9a-f]{64}$/;
const maxBodyBytes = 128 * 1024;
const tooLarge = 'fleet_digest_too_large';

export const GET = withFleetSession(async (actorId) => {
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db.schema('private').rpc('fleet_get_digest', {
      p_actor_id: actorId,
    });
    if (!error) {
      if (data === null) return fleetJson({ error: 'forbidden' }, 403);

      if (Array.isArray(data)) {
        const sections: FleetDigestSection[] = [];
        for (const item of data) {
          const section = fleetStoredDigestSectionSchema.safeParse(item);
          if (section.success) {
            sections.push(section.data);
          } else {
            console.error('Invalid stored Fleet digest section');
          }
        }
        return fleetJson(summarizeFleetDigest(sections));
      }
    }
  } catch {
    // Do not log digest payloads or database errors that may contain labels.
  }
  console.error('Fleet digest lookup failed');
  return fleetJson({ error: 'digest_unavailable' }, 503);
});

export async function PUT(request: Request) {
  await connection();
  const token = publisherBearer.exec(
    request.headers.get('authorization') ?? ''
  )?.[1];
  if (!token) return fleetJson({ error: 'unauthorized' }, 401);

  const expected = process.env.FLEET_DIGEST_PUBLISHER_TOKEN_SHA256;
  if (!expected || !publisherHash.test(expected)) {
    return fleetJson({ error: 'publisher_unavailable' }, 503);
  }
  const actual = createHash('sha256').update(token).digest();
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
    return fleetJson({ error: 'unauthorized' }, 401);
  }

  let input: unknown;
  try {
    const bytes = await readBoundedResponseBytes({
      response: request,
      maxBytes: maxBodyBytes,
      tooLargeMessage: tooLarge,
    });
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof Error && error.message === tooLarge) {
      return fleetJson({ error: 'payload_too_large' }, 413);
    }
    return fleetJson({ error: 'invalid_digest' }, 400);
  }

  const section = fleetDigestSectionSchema.safeParse(input);
  if (!section.success) return fleetJson({ error: 'invalid_digest' }, 400);

  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db
      .schema('private')
      .rpc('fleet_publish_digest', {
        p_project_key: section.data.projectKey,
        p_generated_at: section.data.generatedAt,
        p_lanes: section.data.lanes,
      });
    if (!error) {
      switch (data) {
        case 'published':
          return new NextResponse(null, {
            status: 204,
            headers: { 'Cache-Control': 'private, no-store' },
          });
        case 'stopped':
          return fleetJson({ error: data }, 403);
        case 'stale_snapshot':
          return fleetJson({ error: data }, 409);
        case 'invalid_digest':
        case 'unknown_project':
        case 'unapproved_display_value':
          return fleetJson({ error: data }, 400);
      }
    }
  } catch {
    // Keep publisher credentials and submitted fields out of logs.
  }
  console.error('Fleet digest publish failed');
  return fleetJson({ error: 'digest_unavailable' }, 503);
}
