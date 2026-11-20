import assert from 'node:assert/strict';
import { notFound, redirect } from '@tanstack/router-core';
import { describe, expect, it } from 'vitest';
import { unstable_rethrow } from './navigation';

describe('unstable_rethrow', () => {
  it('preserves the original redirect and not-found control flow', () => {
    for (const signal of [redirect({ href: '/dashboard' }), notFound()]) {
      const wrapped = new Error('Wrapped route result', { cause: signal });
      assert.throws(
        () => unstable_rethrow(wrapped),
        (thrown) => thrown === signal
      );
    }
  });

  it('leaves ordinary and cyclic errors to the caller', () => {
    const error = new Error('Route failed');
    expect(() => unstable_rethrow(error)).not.toThrow();
    error.cause = error;
    expect(() => unstable_rethrow(error)).not.toThrow();
  });
});
