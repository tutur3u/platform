import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import vi_ from '../../../../../../messages/vi.json';

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));

import { NOT_CONNECTED_SOURCES } from './data-coverage';
import { getOperationsDrilldownGroups } from './operations-drilldown';
import {
  getOverviewViewHref,
  OVERVIEW_VIEWS,
  parseOverviewView,
} from './overview-view-switcher';

const wsIdDir = path.resolve(__dirname, '..');

function lookup(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages
    );
}

describe('overview view switcher', () => {
  it('defaults to the executive view for missing or unknown values', () => {
    expect(parseOverviewView(undefined)).toBe('executive');
    expect(parseOverviewView('bogus')).toBe('executive');
    expect(parseOverviewView(['operations', 'executive'])).toBe('operations');
    expect(parseOverviewView('operations')).toBe('operations');
  });

  it('builds stable hrefs', () => {
    expect(getOverviewViewHref('internal', 'executive')).toBe('/internal');
    expect(getOverviewViewHref('internal', 'operations')).toBe(
      '/internal?view=operations'
    );
  });

  it('ships EN and VI labels for each view', () => {
    for (const view of OVERVIEW_VIEWS) {
      for (const messages of [en, vi_]) {
        expect(
          lookup(messages, `infrastructure-analytics.views.${view}.title`)
        ).toEqual(expect.any(String));
      }
    }
  });
});

describe('operations drill-down', () => {
  const groups = getOperationsDrilldownGroups('internal');

  it('only links to existing infrastructure routes', () => {
    for (const link of groups.flatMap((group) => group.links)) {
      const routePath = link.href.replace(/^\/internal/, '');
      expect(
        existsSync(path.join(wsIdDir, routePath, 'page.tsx')),
        link.href
      ).toBe(true);
    }
  });

  it('uses translated titles and group copy in both locales', () => {
    for (const messages of [en, vi_]) {
      for (const group of groups) {
        expect(
          lookup(
            messages,
            `infrastructure-analytics.operations.groups.${group.key}.title`
          )
        ).toEqual(expect.any(String));
        for (const link of group.links) {
          expect(lookup(messages, link.titleKey), link.titleKey).toEqual(
            expect.any(String)
          );
        }
      }
    }
  });
});

describe('data coverage', () => {
  it('labels every unconnected decision source in both locales', () => {
    for (const messages of [en, vi_]) {
      for (const key of NOT_CONNECTED_SOURCES) {
        expect(
          lookup(
            messages,
            `infrastructure-analytics.coverage.gaps.${key}.title`
          )
        ).toEqual(expect.any(String));
      }
    }
  });
});
