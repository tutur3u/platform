import assert from 'node:assert/strict';
import { boundedJson } from './wave1-native-publish.mjs';

export async function isHistoricalVersionNotFound({
  url,
  token,
  fetcher,
  approvedCode,
}) {
  assert.ok(
    Number.isSafeInteger(approvedCode),
    'Missing approved version-not-found code'
  );
  let confirmed = false;
  await boundedJson(url, token, fetcher, undefined, undefined, (errors) => {
    confirmed =
      Array.isArray(errors) &&
      errors.length === 1 &&
      errors[0]?.code === approvedCode &&
      /^worker version not found\.?$/i.test(errors[0]?.message ?? '');
    return confirmed;
  });
  return confirmed;
}
