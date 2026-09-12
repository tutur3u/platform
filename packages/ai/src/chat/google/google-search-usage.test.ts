import { expect, it } from 'vitest';
import { countGoogleSearchQueries } from './google-search-usage';

const search = { toolName: 'server:GOOGLE_SEARCH_WEB' };
const step = (webSearchQueries: string[]) => ({
  toolCalls: [search],
  providerMetadata: { google: { groundingMetadata: { webSearchQueries } } },
});
it('counts Gemini 3 queries instead of one native invocation', () => {
  expect(
    countGoogleSearchQueries(
      'google/gemini-3.5-flash-lite',
      step(['one', 'two', '', 'one']),
      [search]
    )
  ).toBe(2);
  expect(
    countGoogleSearchQueries('google/gemini-2.5-flash', step(['one', 'two']), [
      search,
    ])
  ).toBe(1);
});
it('counts each provider prompt without duplicating top-level metadata', () => {
  const response = {
    ...step(['three']),
    steps: [step(['one', 'two']), step(['three'])],
  };
  expect(
    countGoogleSearchQueries('gemini-3-flash', response, [search, search])
  ).toBe(3);
  expect(
    countGoogleSearchQueries('gemini-2.5-flash', response, [search, search])
  ).toBe(2);
});
it('retains known native usage when optional metadata is unavailable', () => {
  expect(
    countGoogleSearchQueries('google/gemini-3-flash', {}, [search, search])
  ).toBe(2);
});

it('uses final response metadata when the native step omits optional metadata', () => {
  expect(
    countGoogleSearchQueries(
      'google/gemini-3.5-flash-lite',
      {
        ...step(['one', 'two']),
        steps: [{ toolCalls: [search] }],
      },
      [search]
    )
  ).toBe(2);
});
it('does not charge blank query entries even when a native tool event exists', () => {
  expect(
    countGoogleSearchQueries(
      'google/gemini-3-flash',
      {
        steps: [step(['', '   '])],
      },
      [search]
    )
  ).toBe(0);
});
