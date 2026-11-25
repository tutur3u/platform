import { describe, expect, it } from 'vitest';
import {
  getSidebarCategory,
  getSidebarCategoryRank,
  getSidebarItemRank,
  SIDEBAR_CATEGORIES,
} from './sidebar-categories';

describe('sidebar categories', () => {
  it('assigns every app to exactly one category', () => {
    const ids = SIDEBAR_CATEGORIES.flatMap((category) => [...category.itemIds]);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the agreed category order with Overview first and no header', () => {
    expect(SIDEBAR_CATEGORIES.map((category) => category.id)).toEqual([
      'overview',
      'productivity',
      'communication',
      'operations',
      'files_content',
      'ai',
      'utilities',
    ]);
    expect(SIDEBAR_CATEGORIES[0]).toMatchObject({
      collapsible: false,
      showLabel: false,
    });
  });

  it('files each app under its category in a sensible order', () => {
    expect(getSidebarCategory('documents')).toBe('productivity');
    expect(getSidebarCategory('time_tracker')).toBe('productivity');
    expect(getSidebarCategory('mail')).toBe('communication');
    expect(getSidebarCategory('chat')).toBe('communication');
    expect(getSidebarCategory('contacts')).toBe('communication');
    expect(getSidebarCategory('finance')).toBe('operations');
    expect(getSidebarCategory('inventory')).toBe('operations');
    expect(getSidebarCategory('drive')).toBe('files_content');
    expect(getSidebarCategory('hive')).toBe('ai');
    expect(getSidebarCategory('qr_generator')).toBe('utilities');
    expect(getSidebarItemRank('tasks')).toBeLessThan(
      getSidebarItemRank('documents')
    );
    expect(getSidebarItemRank('time_tracker')).toBeLessThan(
      getSidebarItemRank('documents')
    );
  });

  it('falls back to Utilities for unknown apps and sorts them last', () => {
    expect(getSidebarCategory('something-new')).toBe('utilities');
    expect(getSidebarCategory(undefined)).toBe('utilities');
    expect(getSidebarItemRank('something-new')).toBeGreaterThan(
      getSidebarItemRank('link_shortener')
    );
    expect(getSidebarCategoryRank('overview')).toBeLessThan(
      getSidebarCategoryRank('utilities')
    );
  });
});
