import { describe, expect, it } from 'vitest';
import { externalProjectAdapterFixtures } from './fixtures';

describe('external project adapter fixtures', () => {
  it('covers all four adapters with source references', () => {
    expect(Object.keys(externalProjectAdapterFixtures).sort()).toEqual([
      'exocorpse',
      'junly',
      'theguyser',
      'yoola',
    ]);

    for (const fixture of Object.values(externalProjectAdapterFixtures)) {
      expect(fixture.sourceReference).toMatch(
        /(junly|yoola|theguyser|exocorpse)/
      );
      expect(fixture.collections.length).toBeGreaterThan(0);
    }
  });

  it('matches the expected collection layout for each adapter', () => {
    expect(
      externalProjectAdapterFixtures.junly.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'research-projects',
      'game-projects',
      'artworks',
      'feed-posts',
      'music-tracks',
      'singleton-sections',
    ]);

    expect(
      externalProjectAdapterFixtures.yoola.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['artworks', 'lore-capsules', 'singleton-sections']);

    expect(
      externalProjectAdapterFixtures.theguyser.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'panel-content',
      'awards',
      'gallery',
      'experience',
      'contact-social',
    ]);

    expect(
      externalProjectAdapterFixtures.exocorpse.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['portfolio-art', 'writing', 'games']);
  });
});
