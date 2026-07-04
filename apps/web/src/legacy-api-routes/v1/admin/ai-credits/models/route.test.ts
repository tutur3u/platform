import { describe, expect, it } from 'vitest';
import {
  applyAdminAiCreditsModelFilters,
  parseAdminAiCreditsModelFilters,
} from './route-filters';

class FakeModelQuery {
  calls: Array<[string, string, boolean | string | string[]]> = [];

  contains(column: string, value: string[]) {
    this.calls.push(['contains', column, value]);
    return this;
  }

  eq(column: string, value: boolean | string) {
    this.calls.push(['eq', column, value]);
    return this;
  }

  in(column: string, value: string[]) {
    this.calls.push(['in', column, value]);
    return this;
  }

  or(filters: string) {
    this.calls.push(['or', 'filters', filters]);
    return this;
  }
}

describe('admin AI credits model filters', () => {
  it('parses search, type, tag, ids, provider, and enabled filters', () => {
    const filters = parseAdminAiCreditsModelFilters(
      new URLSearchParams({
        enabled: 'true',
        ids: 'google/gemini-3.1-flash-lite, openai/gpt-5 ,',
        provider: 'google',
        q: 'flash, lite',
        tag: 'thinking',
        type: 'language',
      })
    );

    expect(filters).toEqual({
      enabled: true,
      ids: ['google/gemini-3.1-flash-lite', 'openai/gpt-5'],
      provider: 'google',
      search: 'flash lite',
      tag: 'thinking',
      type: 'language',
    });
  });

  it('applies filters to the Supabase model query before pagination', () => {
    const query = new FakeModelQuery();

    applyAdminAiCreditsModelFilters(query, {
      enabled: false,
      ids: ['google/gemini-3.1-flash-lite'],
      provider: 'google',
      search: 'flash',
      tag: 'thinking',
      type: 'language',
    });

    expect(query.calls).toEqual([
      ['eq', 'provider', 'google'],
      ['eq', 'type', 'language'],
      ['contains', 'tags', ['thinking']],
      ['in', 'id', ['google/gemini-3.1-flash-lite']],
      [
        'or',
        'filters',
        'id.ilike.%flash%,name.ilike.%flash%,provider.ilike.%flash%,description.ilike.%flash%',
      ],
      ['eq', 'is_enabled', false],
    ]);
  });
});
