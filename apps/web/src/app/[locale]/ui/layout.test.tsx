import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import UiDocsLayout, { UiDocsRuntime } from './layout';

describe('UI docs layout', () => {
  it('keeps locale and message loading inside a Suspense boundary', () => {
    const props = {
      children: <div>UI docs</div>,
      params: Promise.resolve({ locale: 'en' }),
    };

    const layout = UiDocsLayout(props);

    expect(layout).not.toBeInstanceOf(Promise);
    expect(layout.type).toBe(Suspense);
    expect(layout.props.children.type).toBe(UiDocsRuntime);
    expect(layout.props.children.props).toEqual(props);
  });
});
