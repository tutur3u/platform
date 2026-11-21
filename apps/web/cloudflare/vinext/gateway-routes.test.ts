import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildGatewayRouteTable,
  entryPattern,
  GATEWAY_ROUTES_FILE,
} from './gateway-routes';

describe('gateway route table', () => {
  it('matches the committed apps/gateway table', () => {
    expect(JSON.parse(readFileSync(GATEWAY_ROUTES_FILE, 'utf8'))).toEqual(
      buildGatewayRouteTable()
    );
  });

  it('maps metadata entries to the URLs Next.js serves', () => {
    expect(entryPattern('sitemap.ts')).toBe('/sitemap.xml');
    expect(entryPattern('robots.ts')).toBe('/robots.txt');
    expect(entryPattern('manifest.ts')).toBe('/manifest.webmanifest');
    expect(
      entryPattern('[locale]/(marketing)/partners/opengraph-image.png')
    ).toBe('/[locale]/partners/opengraph-image.png');
    expect(
      entryPattern('[locale]/(marketing)/branding/twitter-image.tsx')
    ).toBe('/[locale]/branding/twitter-image/[[...metadata]]');
    expect(entryPattern('api/health/route.ts')).toBe('/api/health');
  });
});
