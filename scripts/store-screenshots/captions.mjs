// Maps store metadata screenshot entries to image captions and output paths.
// Captions (headline and overline label) live in store-captions.json, keyed
// by screen id; the metadata files carry the same headline text for stores
// that list captions, and validate.test.mjs keeps the two in step.
import fs from 'node:fs';
import path from 'node:path';
import { screenshotPath, SCREEN_IDS } from './specs.mjs';

/** @type {{ screens: Record<string, { en: string, vi: string, overline: { en: string, vi: string }, chip?: { en: string, vi: string } }> }} */
export const STORE_CAPTIONS = JSON.parse(
  fs.readFileSync(new URL('./store-captions.json', import.meta.url), 'utf8')
);

/** Reads `<metadataDir>/<store>.json`, or null when the listing is absent. */
export function loadMetadata(metadataDir, store) {
  const file = path.join(metadataDir, `${store}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The headline, overline label and optional chip text of screen [id] in
 * [locale].
 * @returns {{ headline: string, overline: string, chip: string | null }}
 */
export function captionFor(locale, id) {
  const entry = STORE_CAPTIONS.screens[id];
  const headline = entry?.[locale];
  const overline = entry?.overline?.[locale];
  if (!headline || !overline) throw new Error(`No caption for ${locale}/${id}`);
  return { headline, overline, chip: entry.chip?.[locale] ?? null };
}

/**
 * The screens to render for one target and locale: metadata order and file
 * paths when the listing names them, otherwise every screen in story order.
 * @returns {Array<{ id: string, file: string, headline: string, overline: string, chip: string | null }>}
 */
export function planScreens(metadata, target, locale) {
  const entries = metadata?.screenshots?.[target.device];
  const list =
    Array.isArray(entries) && entries.length > 0
      ? entries.map((entry) => ({
          id: entry.id,
          file:
            entry.files?.[locale] ?? screenshotPath(target, locale, entry.id),
        }))
      : SCREEN_IDS.map((id) => ({
          id,
          file: screenshotPath(target, locale, id),
        }));
  return list.map(({ id, file }) => ({
    id,
    file,
    ...captionFor(locale, id),
  }));
}
