// Maps store metadata screenshot entries to image headlines and output paths.
import fs from 'node:fs';
import path from 'node:path';
import { screenshotPath, SCREEN_IDS } from './specs.mjs';

/** Captions longer than this read as sentences; the short fallback is used. */
export const HEADLINE_MAX_CHARS = 48;

const FALLBACK = JSON.parse(
  fs.readFileSync(new URL('./captions.json', import.meta.url), 'utf8')
);

/** Reads `<metadataDir>/<store>.json`, or null when the listing is absent. */
export function loadMetadata(metadataDir, store) {
  const file = path.join(metadataDir, `${store}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The screens to render for one target and locale: metadata order and file
 * paths when the listing names them, otherwise every screen in default order.
 * @returns {Array<{ id: string, file: string, headline: string }>}
 */
export function planScreens(metadata, target, locale) {
  const entries = metadata?.screenshots?.[target.device];
  const list =
    Array.isArray(entries) && entries.length > 0
      ? entries.map((entry) => ({
          id: entry.id,
          file:
            entry.files?.[locale] ?? screenshotPath(target, locale, entry.id),
          caption: entry.caption?.[locale],
        }))
      : SCREEN_IDS.map((id) => ({
          id,
          file: screenshotPath(target, locale, id),
          caption: null,
        }));
  return list.map(({ id, file, caption }) => ({
    id,
    file,
    headline: headlineFor(caption, locale, id),
  }));
}

export function headlineFor(caption, locale, id) {
  const text = typeof caption === 'string' ? caption.trim() : '';
  if (text && [...text].length <= HEADLINE_MAX_CHARS) return text;
  const fallback = FALLBACK[locale]?.[id];
  if (!fallback) throw new Error(`No headline for ${locale}/${id}`);
  return fallback;
}
