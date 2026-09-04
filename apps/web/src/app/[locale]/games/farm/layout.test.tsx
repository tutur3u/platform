import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import FarmGameLayout, { FarmGameRuntime } from './layout';

describe('Farm game layout', () => {
  it('keeps its authenticated runtime work inside Suspense', () => {
    const child = <div>Farm</div>;
    const layout = FarmGameLayout({ children: child });

    expect(layout.type).toBe(Suspense);
    expect(layout.props.children.type).toBe(FarmGameRuntime);
    expect(layout.props.children.props.children).toBe(child);
  });
});
