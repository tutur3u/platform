import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import viMessages from '../../../../messages/vi.json';
import {
  componentDocs,
  componentDocsByCategory,
  getAdjacentComponentDocs,
  getComponentDoc,
} from './component-docs';
import { componentEntries } from './component-registry';

const requiredTranslationPaths = [
  'ui-showcase.docs.code.copy',
  'ui-showcase.docs.nav.search',
  'ui-showcase.docs.overview.title',
  'ui-showcase.docs.setup.title',
  'ui-showcase.docs.components.title',
  'ui-showcase.docs.contributing.title',
  'ui-showcase.docs.detail.installationTitle',
  'ui-showcase.docs.detail.usageTitle',
  'ui-showcase.docs.detail.examplesTitle',
  'ui-showcase.docs.detail.apiTitle',
  'ui-showcase.docs.detail.relatedTitle',
  'ui-showcase.docs.detail.toc.preview',
  'ui-showcase.docs.status.live',
  'ui-showcase.docs.status.pattern',
];

describe('ui component docs registry', () => {
  it('covers every current UI registry component once', () => {
    expect(componentEntries).toHaveLength(62);
    expect(componentDocs).toHaveLength(componentEntries.length);

    const ids = new Set(componentDocs.map((doc) => doc.id));
    const slugs = new Set(componentDocs.map((doc) => doc.slug));

    expect(ids.size).toBe(componentDocs.length);
    expect(slugs.size).toBe(componentDocs.length);
  });

  it('generates complete docs metadata for each component', () => {
    for (const doc of componentDocs) {
      expect(doc.slug).toBeTruthy();
      expect(doc.installation.command).toContain('@tuturuuu/ui');
      expect(doc.installation.manualSteps.length).toBeGreaterThanOrEqual(2);
      expect(doc.usage).toContain(doc.importPath);
      expect(doc.examples.length).toBeGreaterThanOrEqual(2);
      expect(doc.apiReference.rows).toHaveLength(doc.exports.length);
      expect(doc.related.length).toBeGreaterThan(0);
      expect(getComponentDoc(doc.slug)?.id).toBe(doc.id);
    }
  });

  it('groups docs by category without dropping entries', () => {
    const groupedCount = componentDocsByCategory.reduce(
      (sum, group) => sum + group.docs.length,
      0
    );

    expect(groupedCount).toBe(componentDocs.length);
    expect(
      componentDocsByCategory.every((group) => group.docs.length > 0)
    ).toBe(true);
  });

  it('links previous and next component references', () => {
    const first = componentDocs[0];
    const middle = componentDocs[10];
    const last = componentDocs.at(-1);

    expect(first).toBeDefined();
    expect(middle).toBeDefined();
    expect(last).toBeDefined();

    expect(getAdjacentComponentDocs(first!).previous).toBeUndefined();
    expect(getAdjacentComponentDocs(middle!).previous).toBeDefined();
    expect(getAdjacentComponentDocs(middle!).next).toBeDefined();
    expect(getAdjacentComponentDocs(last!).next).toBeUndefined();
  });

  it('keeps required docs translation keys in English and Vietnamese', () => {
    for (const path of requiredTranslationPaths) {
      expect(readMessage(enMessages, path), `en:${path}`).toBeTruthy();
      expect(readMessage(viMessages, path), `vi:${path}`).toBeTruthy();
    }
  });
});

function readMessage(messages: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, messages);
}
