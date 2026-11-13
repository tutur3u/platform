import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { DesignFrameFallback } from '../../ui/design-frame';
import DesignLayout, { DesignRuntime } from './layout';

describe('design layout', () => {
  it('reserves the marketing frame while locale data loads', () => {
    const props = {
      children: <div>Design</div>,
      params: Promise.resolve({ locale: 'en' }),
    };

    const layout = DesignLayout(props);

    expect(layout.type).toBe(Suspense);
    expect(layout.props.fallback.type).toBe(DesignFrameFallback);
    expect(layout.props.children.type).toBe(DesignRuntime);
    expect(layout.props.children.props).toEqual(props);
  });
});
