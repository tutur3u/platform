#!/usr/bin/env node

/**
 * Deletes storage buckets that are created by migrations.
 * This must run BEFORE `supabase db reset --linked` to prevent
 * migration failures when buckets already exist.
 *
 * Uses the Supabase Storage Admin API with the service_role key.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF_PATH = resolve(__dirname, '../supabase/.temp/project-ref');

// Buckets created by migrations that must be deleted before reset
const BUCKETS_TO_DELETE = [
  'avatars',
  'support_inquiries',
  'time_tracking_requests',
];

function readProjectRef() {
  try {
    return readFileSync(PROJECT_REF_PATH, 'utf-8').trim();
  } catch (error) {
    console.error('\n❌ Error: Could not read project-ref file');
    console.error(`   Path: ${PROJECT_REF_PATH}`);
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

function getServiceRoleKey(projectRef) {
  try {
    const output = execFileSync(
      'bun',
      [
        'supabase',
        'projects',
        'api-keys',
        '--project-ref',
        projectRef,
        '--output',
        'json',
      ],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const keys = JSON.parse(output);

    const serviceRole = keys.find((k) => k.name === 'service_role');
    if (!serviceRole) {
      throw new Error('service_role key not found in API keys response');
    }

    return serviceRole.api_key;
  } catch (error) {
    console.error('\n❌ Error: Could not retrieve service role key');
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

async function emptyBucket(projectRef, serviceRoleKey, bucketId) {
  const url = `https://${projectRef}.supabase.co/storage/v1/bucket/${bucketId}/empty`;
  return fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

async function deleteBucket(projectRef, serviceRoleKey, bucketId) {
  const url = `https://${projectRef}.supabase.co/storage/v1/bucket/${bucketId}`;
  return fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

async function main() {
  const projectRef = readProjectRef();

  console.log('\n🗑️  Deleting storage buckets before reset...\n');

  const serviceRoleKey = getServiceRoleKey(projectRef);

  for (const bucketId of BUCKETS_TO_DELETE) {
    process.stdout.write(`   ${bucketId}... `);

    // Step 1: Empty the bucket (required before deletion)
    const emptyRes = await emptyBucket(projectRef, serviceRoleKey, bucketId);

    if (emptyRes.ok) {
      // Step 2: Delete the empty bucket
      const deleteRes = await deleteBucket(
        projectRef,
        serviceRoleKey,
        bucketId
      );

      if (deleteRes.ok) {
        console.log('✅ deleted');
      } else if (deleteRes.status === 404) {
        console.log('⏭️  not found (skipped)');
      } else {
        const body = await deleteRes.text();
        console.log(`⚠️  delete failed (${deleteRes.status}): ${body}`);
      }
    } else if (emptyRes.status === 404) {
      console.log('⏭️  not found (skipped)');
    } else {
      const body = await emptyRes.text();
      console.log(`⚠️  empty failed (${emptyRes.status}): ${body}`);
    }
  }

  console.log('\n✅ Storage bucket cleanup complete.\n');
}

main();
