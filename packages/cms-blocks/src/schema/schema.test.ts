import { describe, expect, it } from 'vitest';
import { allBlocks, samplePage } from './fixtures.test-utils';
import { cmsBlockRegistry, cmsBlockTypes, createCmsBlock } from './registry';
import { cmsBlockProps, cmsBlockSchema, cmsPageSchema } from './schema';

describe('cms block schema', () => {
  it('round-trips a page through JSON without loss', () => {
    const parsed = cmsPageSchema.parse(JSON.parse(JSON.stringify(samplePage)));
    expect(parsed).toEqual(samplePage);
    expect(cmsPageSchema.parse(parsed)).toEqual(parsed);
  });

  it('rejects unknown blocks, unknown props, nested layouts and other versions', () => {
    const reject = (value: unknown) =>
      expect(cmsBlockSchema.safeParse(value).success).toBe(false);
    reject({ props: { id: 'x' }, type: 'Marquee' });
    reject({ props: { extra: 1, id: 's', size: 'md' }, type: 'Spacer' });
    reject({
      props: { id: 'n', left: [allBlocks[8]], ratio: '1:1', right: [] },
      type: 'TwoColumn',
    });
    expect(
      cmsPageSchema.safeParse({ ...samplePage, schemaVersion: 2 }).success
    ).toBe(false);
  });
});

describe('cms block registry', () => {
  it('covers every schema block with matching field keys and select options', () => {
    expect([...cmsBlockTypes].sort()).toEqual(
      Object.keys(cmsBlockProps).sort()
    );
    for (const type of cmsBlockTypes) {
      const fields = cmsBlockRegistry[type].fields as Record<
        string,
        { kind: string; options?: readonly string[] }
      >;
      const shape = cmsBlockProps[type] as Record<
        string,
        { options?: readonly string[] }
      >;
      expect(Object.keys(fields).sort(), type).toEqual(
        Object.keys(shape).sort()
      );
      for (const [name, field] of Object.entries(fields)) {
        if (field.kind === 'select')
          expect(field.options, `${type}.${name}`).toEqual(
            shape[name]?.options
          );
      }
    }
  });

  it.each(cmsBlockTypes)(
    'creates a schema-valid %s block from defaults',
    (type) => {
      const block = createCmsBlock(type, `${type}-1`);
      expect(block.props.id).toBe(`${type}-1`);
      expect(cmsBlockSchema.parse(block)).toEqual(block);
    }
  );
});
