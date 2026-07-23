import { describe, expect, it } from 'vitest';
import {
  getCmsEditorBlueprintViews,
  getCmsLandingCollectionSlugs,
} from './cms-editor-blueprints';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_ADAPTER_OPTIONS,
  EXTERNAL_PROJECT_DISPLAY_NAMES,
} from './constants';

describe('CMS editor Richfield adapter registration', () => {
  it('registers Richfield as a selectable external project adapter', () => {
    expect(EXTERNAL_PROJECT_ADAPTER_OPTIONS).toContain('richfield');
    expect(EXTERNAL_PROJECT_DISPLAY_NAMES.richfield).toBe('Richfield');
    expect(DEFAULT_EXTERNAL_PROJECT_COLLECTIONS.richfield).toEqual([
      'brands',
      'leadership',
      'milestones',
      'contact-page',
      'contact-channels',
      'contact-form',
      'contact-submissions',
      'articles',
      'jobs',
      'image-library',
    ]);
  });

  it('groups Richfield content around the main CMS testing surfaces', () => {
    const views = getCmsEditorBlueprintViews('richfield');

    expect(views.map((view) => view.id)).toEqual([
      'brands',
      'leadership',
      'timeline',
      'contacts',
      'articles',
      'careers',
      'gallery',
    ]);
    expect(views.map((view) => view.collectionSlugs)).toEqual([
      ['brands'],
      ['leadership'],
      ['milestones'],
      [
        'contact-page',
        'contact-channels',
        'contact-form',
        'contact-submissions',
      ],
      ['articles'],
      ['jobs'],
      ['image-library'],
    ]);
    expect(getCmsLandingCollectionSlugs('richfield')).toEqual([
      'brands',
      'contact-page',
      'contact-channels',
      'contact-form',
      'articles',
      'jobs',
      'image-library',
    ]);
  });
});
