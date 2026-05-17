import type {
  ExternalProjectCollection,
  ExternalProjectFieldDefinition,
} from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import {
  buildCmsContentModelTemplates,
  buildCollectionConfigFromTemplate,
  buildCollectionSchemaFromTemplate,
  buildDefaultFieldValues,
  getCollectionFieldDefinitions,
  getContentModelTemplateStatus,
} from './cms-content-model';
import type { CmsStrings } from './cms-strings';

const strings = new Proxy(
  {},
  {
    get: (_target, property) => String(property),
  }
) as CmsStrings;

describe('CMS content model templates', () => {
  it('defines the proof-case collection templates', () => {
    const templates = buildCmsContentModelTemplates(strings);

    expect(templates.map((template) => template.slug)).toEqual([
      'profile',
      'blog-posts',
      'gallery',
      'shop-products',
      'writing-worlds',
      'social-links',
    ]);
  });

  it('converts template fields into a collection schema config', () => {
    const shopTemplate = buildCmsContentModelTemplates(strings).find(
      (template) => template.slug === 'shop-products'
    );

    expect(shopTemplate).toBeDefined();

    const schema = buildCollectionSchemaFromTemplate(shopTemplate!);
    const config = buildCollectionConfigFromTemplate(shopTemplate!);

    expect(schema.profileFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'price', type: 'number' }),
        expect.objectContaining({ key: 'available', type: 'boolean' }),
      ])
    );
    expect(schema.metadataFields).toEqual([
      expect.objectContaining({ key: 'sku', type: 'string' }),
    ]);
    expect(config).toEqual({ schema });
  });

  it('preserves existing collection config when applying a template schema', () => {
    const profileTemplate = buildCmsContentModelTemplates(strings)[0]!;

    expect(
      buildCollectionConfigFromTemplate(profileTemplate, {
        navigationTitle: 'Studio',
      })
    ).toEqual({
      navigationTitle: 'Studio',
      schema: buildCollectionSchemaFromTemplate(profileTemplate),
    });
  });

  it('reports whether a template still needs collection fields', () => {
    const template = buildCmsContentModelTemplates(strings)[0]!;
    const collection = {
      id: 'collection-1',
      slug: template.slug,
    } as ExternalProjectCollection;

    const status = getContentModelTemplateStatus({
      collections: [collection],
      fieldDefinitions: template.fields.map((field) =>
        fieldDefinition({
          collection_id: collection.id,
          field_scope: field.field_scope,
          field_type: field.field_type,
          key: field.key,
        })
      ),
      template,
    });

    expect(status.installed).toBe(true);
    expect(status.missingFields).toEqual([]);
  });

  it('sorts enabled collection and global field definitions', () => {
    const collection = {
      id: 'collection-1',
    } as ExternalProjectCollection;
    const definitions = [
      fieldDefinition({
        collection_id: 'collection-1',
        created_at: '2026-05-17T09:03:00.000Z',
        key: 'body',
        sort_order: 1,
      }),
      fieldDefinition({
        collection_id: null,
        created_at: '2026-05-17T09:02:00.000Z',
        key: 'global',
        sort_order: 99,
      }),
      fieldDefinition({
        collection_id: 'collection-1',
        created_at: '2026-05-17T09:01:00.000Z',
        is_enabled: false,
        key: 'disabled',
        sort_order: 0,
      }),
      fieldDefinition({
        collection_id: 'other-collection',
        created_at: '2026-05-17T09:00:00.000Z',
        key: 'other',
        sort_order: 0,
      }),
    ];

    expect(
      getCollectionFieldDefinitions({
        collection,
        fieldDefinitions: definitions,
      }).map((definition) => definition.key)
    ).toEqual(['global', 'body']);
  });

  it('builds default values for modeled fields', () => {
    const definitions = [
      fieldDefinition({ default_value: 'draft', key: 'status' }),
      fieldDefinition({ default_value: null, key: 'empty' }),
      fieldDefinition({ default_value: ['tag-a'], key: 'tags' }),
    ];

    expect(buildDefaultFieldValues(definitions)).toEqual({
      status: 'draft',
      tags: ['tag-a'],
    });
  });
});

function fieldDefinition(
  overrides: Partial<ExternalProjectFieldDefinition>
): ExternalProjectFieldDefinition {
  return {
    collection_id: 'collection-1',
    created_at: '2026-05-17T09:00:00.000Z',
    created_by: 'user-1',
    default_value: null,
    description: null,
    field_scope: 'profile_data',
    field_type: 'string',
    id: crypto.randomUUID(),
    is_enabled: true,
    is_required: false,
    key: 'field',
    label: 'Field',
    options: [],
    sort_order: 0,
    source: 'cms',
    updated_at: '2026-05-17T09:00:00.000Z',
    updated_by: 'user-1',
    ws_id: 'workspace-1',
    ...overrides,
  };
}
