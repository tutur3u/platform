// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { describe, expect, it } from 'vitest';
import {
  isUnknownRouteShape,
  isWorkspaceReferenceSegment,
  KNOWN_ROOT_ROUTE_SEGMENTS,
  WORKSPACE_CHILD_ROUTE_SEGMENTS,
} from './route-shape';

const localeDir = path.resolve(__dirname, '../app/[locale]');
const workspaceDir = path.join(localeDir, '(dashboard)/[wsId]');
const ROUTE_FILE = /^(?:page|route|layout|default)\.(?:tsx?|jsx?|mdx)$/u;

function hasRouteFile(directory: string): boolean {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .some((entry) =>
      entry.isDirectory()
        ? hasRouteFile(path.join(directory, entry.name))
        : ROUTE_FILE.test(entry.name)
    );
}

/**
 * Static URL segments directly under `directory`: route groups `(x)` are
 * flattened, while private `_x`, dynamic `[x]` and folders without any page,
 * route or layout file (components, hooks, tests) are not URL segments.
 */
function routeSegments(directory: string): string[] {
  const found = new Set<string>();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(directory, entry.name);
    if (/^\(.+\)$/u.test(entry.name)) {
      for (const segment of routeSegments(full)) found.add(segment);
      continue;
    }
    if (/^[_[]/u.test(entry.name)) continue;
    if (hasRouteFile(full)) found.add(entry.name);
  }
  return [...found].sort();
}

describe('route-shape lists stay bound to the app directory', () => {
  it('lists exactly the static routes under app/[locale]', () => {
    expect([...KNOWN_ROOT_ROUTE_SEGMENTS].sort()).toEqual(
      routeSegments(localeDir)
    );
  });

  it('lists exactly the static routes under [wsId]', () => {
    // A new workspace page must be added here, or signed-out shared links to
    // it would render 404 instead of redirecting to login.
    expect([...WORKSPACE_CHILD_ROUTE_SEGMENTS].sort()).toEqual(
      routeSegments(workspaceDir)
    );
  });

  it('matches the shared workspace UUID literal check', () => {
    for (const value of [
      '00000000-0000-0000-0000-000000000000',
      'A1B2C3D4-E5F6-4789-ABCD-0123456789EF',
      'not-a-uuid',
      '00000000-0000-0000-0000-00000000000',
    ])
      expect(
        isWorkspaceReferenceSegment(value) &&
          !['personal', 'internal'].includes(value.toLowerCase())
      ).toBe(isWorkspaceUuidLiteral(value));
  });
});

describe('isUnknownRouteShape', () => {
  const uuid = '3f9a1c2e-1b2c-4d5e-8f90-0123456789ab';

  it('keeps the login redirect for every known shape', () => {
    for (const segments of [
      ['calendar'],
      ['onboarding'],
      ['users', 'x'],
      [uuid],
      [uuid, 'not-a-known-child'],
      ['personal'],
      ['PERSONAL', 'tasks'],
      ['internal'],
      ['acme-handle', 'tasks'],
      ['acme-handle', 'settings', 'members'],
      ['acme-handle', 'calendar'],
    ])
      expect(isUnknownRouteShape(segments), segments.join('/')).toBe(false);
  });

  it('renders not-found for shapes no route can serve', () => {
    for (const segments of [
      ['some-nonexistent-path-xyz'],
      ['acme-handle'],
      ['foo', 'bar'],
      ['foo', 'bar', 'tasks'],
    ])
      expect(isUnknownRouteShape(segments), segments.join('/')).toBe(true);
  });

  it('leaves the root and framework-reserved segments to existing handling', () => {
    for (const segments of [
      [],
      ['_next', 'x'],
      ['.well-known', 'x'],
      ['~offline'],
      ['@modal'],
    ])
      expect(isUnknownRouteShape(segments), segments.join('/')).toBe(false);
  });
});
