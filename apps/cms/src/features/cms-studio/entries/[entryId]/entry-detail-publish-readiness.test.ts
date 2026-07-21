import { describe, expect, it } from 'vitest';
import {
  getEntryPublishReadiness,
  hasMeaningfulStructuredContent,
} from './entry-detail-publish-readiness';

describe('getEntryPublishReadiness', () => {
  it('reports a complete publish checklist for a finished visual entry', () => {
    const result = getEntryPublishReadiness({
      bodyMarkdown: 'Long-form content',
      coverRecommended: true,
      hasCover: true,
      hasStructuredContent: false,
      slug: 'welcome-story',
      summary: null,
      title: 'Welcome story',
    });

    expect(result.isComplete).toBe(true);
    expect(result.completeCount).toBe(4);
    expect(result.totalCount).toBe(4);
  });

  it('accepts structured fields as meaningful content', () => {
    const result = getEntryPublishReadiness({
      bodyMarkdown: '',
      coverRecommended: false,
      hasCover: false,
      hasStructuredContent: true,
      slug: 'product-card',
      summary: null,
      title: 'Product card',
    });

    expect(result.isComplete).toBe(true);
    expect(result.items).not.toContainEqual({ complete: false, id: 'content' });
    expect(result.items.some((item) => item.id === 'cover')).toBe(false);
  });

  it('identifies missing essentials without blocking the editor', () => {
    const result = getEntryPublishReadiness({
      bodyMarkdown: '',
      coverRecommended: true,
      hasCover: false,
      hasStructuredContent: false,
      slug: '',
      summary: null,
      title: 'Draft title',
    });

    expect(result.isComplete).toBe(false);
    expect(result.completeCount).toBe(1);
    expect(result.items).toEqual([
      { complete: true, id: 'title' },
      { complete: false, id: 'slug' },
      { complete: false, id: 'content' },
      { complete: false, id: 'cover' },
    ]);
  });

  it('recognizes meaningful nested structured content', () => {
    expect(
      hasMeaningfulStructuredContent(
        { description: '   ', enabled: false },
        { sections: [{ label: 'Visitor value' }] }
      )
    ).toBe(true);
    expect(
      hasMeaningfulStructuredContent({ description: ' ', enabled: false })
    ).toBe(false);
  });
});
