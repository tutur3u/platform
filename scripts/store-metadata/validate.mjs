#!/usr/bin/env node
// Validates the public store listings in apps/mobile/store/metadata against
// the schema limits, the cross-field rules each store enforces at upload time,
// and the public-data rules for the tuturuuu.com/roadmap build.
//
//   node scripts/store-metadata/validate.mjs [--require-assets] [--counts]
//
// --require-assets  fail when a referenced screenshot, gallery image or graphic is missing
// --counts          print character/byte counts for every listing field

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkAssetFiles,
  checkGallery,
  checkScreenshots,
} from './asset-checks.mjs';
import {
  checkCopy,
  checkKeywords,
  checkPublicData,
  checkRelease,
  LOCALES,
  walk,
} from './content-checks.mjs';
import { charLength, utf8Bytes, validateSchema } from './schema-lite.mjs';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const METADATA_DIR = 'apps/mobile/store/metadata';
export const INTERNAL_DIR = 'apps/mobile/store/internal';
export const STORE_FILES = ['ios', 'macos', 'android', 'windows'];

const STORE_BY_SLUG = {
  ios: 'app-store-ios',
  macos: 'app-store-macos',
  android: 'google-play',
  windows: 'microsoft-store',
};

// Internal fields that name the documents they came from, not private values.
const INTERNAL_REFERENCE_KEYS = new Set(['store', 'sources']);

export function loadSchema(root = REPO_ROOT) {
  return JSON.parse(
    readFileSync(path.join(root, METADATA_DIR, 'schema.json'), 'utf8')
  );
}

/** String values recorded in apps/mobile/store/internal, which must stay private. */
export function loadInternalValues(root = REPO_ROOT) {
  const directory = path.join(root, INTERNAL_DIR);
  if (!existsSync(directory)) return [];
  const values = new Set();
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
    for (const [key, value] of Object.entries(data)) {
      if (INTERNAL_REFERENCE_KEYS.has(key)) continue;
      for (const [, item] of walk(value)) {
        if (typeof item === 'string' && item.length >= 8) values.add(item);
      }
    }
  }
  return [...values];
}

/**
 * Validate one parsed listing. `slug` is the file's basename.
 * @returns {{ errors: {path: string, message: string}[], warnings: {path: string, message: string}[], pending: string[] }}
 */
export function validateListing(listing, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const schema = options.schema ?? loadSchema(root);
  const internalValues = options.internalValues ?? loadInternalValues(root);
  const { slug, requireAssets = false } = options;
  const { errors, warnings } = validateSchema(listing, schema);
  const pending = [];
  if (slug && listing.slug !== slug) {
    errors.push({
      path: '$.slug',
      message: `must match the file name "${slug}"`,
    });
  }
  const expectedStore = STORE_BY_SLUG[listing.slug];
  if (expectedStore && listing.store !== expectedStore) {
    errors.push({
      path: '$.store',
      message: `slug "${listing.slug}" belongs to ${expectedStore}`,
    });
  }
  checkRelease(listing, errors);
  checkCopy(listing, errors);
  checkKeywords(listing, errors);
  checkPublicData(listing, internalValues, errors);
  checkScreenshots(listing, errors);
  checkGallery(listing, errors);
  checkAssetFiles(listing, { root, requireAssets }, errors, pending);
  return { errors, warnings, pending };
}

/** Rows of [field, detail] with per-language character and byte counts. */
export function fieldCounts(listing) {
  const rows = [];
  for (const [field, value] of Object.entries(listing.listing ?? {})) {
    if (Array.isArray(value)) {
      for (const locale of LOCALES) {
        const lengths = value.map((item) => charLength(item?.[locale] ?? ''));
        rows.push([
          `${field}.${locale}`,
          `${value.length} items, longest ${Math.max(0, ...lengths)}`,
        ]);
      }
    } else if (value && typeof value === 'object') {
      for (const locale of LOCALES) {
        const text = value[locale] ?? '';
        rows.push([
          `${field}.${locale}`,
          `${charLength(text)} chars, ${utf8Bytes(text)} bytes`,
        ]);
      }
    } else {
      rows.push([field, String(value)]);
    }
  }
  return rows;
}

export function validateAll({ root = REPO_ROOT, requireAssets = false } = {}) {
  const schema = loadSchema(root);
  const internalValues = loadInternalValues(root);
  return STORE_FILES.map((slug) => {
    const listing = JSON.parse(
      readFileSync(path.join(root, METADATA_DIR, `${slug}.json`), 'utf8')
    );
    return {
      slug,
      listing,
      ...validateListing(listing, {
        slug,
        schema,
        root,
        requireAssets,
        internalValues,
      }),
    };
  });
}

function main(argv) {
  const requireAssets = argv.includes('--require-assets');
  let failed = false;
  for (const result of validateAll({ requireAssets })) {
    const { slug, listing, errors, warnings, pending } = result;
    console.log(
      `${slug}.json (${listing.store}): ${errors.length ? 'FAIL' : 'ok'}`
    );
    for (const { path: at, message } of errors) {
      console.error(`  error ${at}: ${message}`);
    }
    for (const { path: at, message } of warnings) {
      console.warn(`  warning ${at}: ${message}`);
    }
    if (pending.length) {
      console.log(`  ${pending.length} referenced assets not produced yet`);
    }
    if (argv.includes('--counts')) {
      for (const [field, detail] of fieldCounts(listing)) {
        console.log(`  ${field}: ${detail}`);
      }
    }
    failed ||= errors.length > 0;
  }
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
