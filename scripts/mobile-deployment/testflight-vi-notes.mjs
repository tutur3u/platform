#!/usr/bin/env node
// Adds a Vietnamese TestFlight "What to Test" next to the verified en-US notes.
// Best effort: Apple can refuse a locale the app has no beta localization for,
// and that must never fail an upload testers can already install.
import { pathToFileURL } from 'node:url';
import { connectApple } from './verify-store.mjs';

export const TESTFLIGHT_VI_LOCALE = 'vi';
const TESTFLIGHT_NOTES_LIMIT = 4000;

export function vietnameseTestNotes(english) {
  const text = String(english ?? '').trim();
  if (!text) return '';
  const body = text.replace(
    /^Please test (\d+\.\d+\.\d+):/u,
    'Vui lòng kiểm tra $1:'
  );
  const notes = body === text ? `Bản thử nghiệm mới:\n${text}` : body;
  return [...notes].length > TESTFLIGHT_NOTES_LIMIT ? '' : notes;
}

export async function ensureVietnameseTestNotes(apple, buildId) {
  const resources = await apple(
    `/v1/builds/${buildId}/betaBuildLocalizations?limit=200`
  );
  const byLocale = (locale) =>
    resources.data?.find((item) => item.attributes?.locale === locale);
  if (byLocale(TESTFLIGHT_VI_LOCALE)?.attributes?.whatsNew?.trim())
    return 'preserved';
  const notes = vietnameseTestNotes(byLocale('en-US')?.attributes?.whatsNew);
  if (!notes) return 'no-english-notes';
  const existing = byLocale(TESTFLIGHT_VI_LOCALE);
  await apple(
    existing
      ? `/v1/betaBuildLocalizations/${existing.id}`
      : '/v1/betaBuildLocalizations',
    {
      method: existing ? 'PATCH' : 'POST',
      body: JSON.stringify({
        data: existing
          ? {
              type: 'betaBuildLocalizations',
              id: existing.id,
              attributes: { whatsNew: notes },
            }
          : {
              type: 'betaBuildLocalizations',
              attributes: { locale: TESTFLIGHT_VI_LOCALE, whatsNew: notes },
              relationships: {
                build: { data: { type: 'builds', id: buildId } },
              },
            },
      }),
    }
  );
  return existing ? 'filled' : 'created';
}

async function main(buildNumber) {
  const { apple, appId } = await connectApple();
  const builds = await apple(
    `/v1/builds?${new URLSearchParams({ 'filter[app]': appId, 'filter[version]': buildNumber, limit: '2' })}`
  );
  if (builds.data?.length !== 1)
    throw new Error(`Expected one TestFlight build ${buildNumber}`);
  const result = await ensureVietnameseTestNotes(apple, builds.data[0].id);
  console.log(
    `Vietnamese TestFlight notes for build ${buildNumber}: ${result}.`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [buildNumber] = process.argv.slice(2);
  try {
    if (!/^[1-9]\d*$/u.test(buildNumber ?? ''))
      throw new Error('A numeric build number is required');
    await main(buildNumber);
  } catch (error) {
    console.log(
      `::warning title=Vietnamese TestFlight notes skipped::${error.message}`
    );
  }
}
