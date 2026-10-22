import { render } from '@testing-library/react';
import { AppErrorBoundary } from '@tuturuuu/ui/custom/app-error-boundary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '../routes/__root';

vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: vi.fn(() => null),
}));
vi.mock('./page-data', () => ({ loadGateway: vi.fn() }));
vi.mock('./providers', () => ({ GatewayProviders: vi.fn(() => null) }));

beforeEach(() => vi.clearAllMocks());

function renderFailure(error: unknown) {
  const Component = Route.options.errorComponent;
  if (!Component) throw new Error('Expected the Apps route error component');
  const reset = vi.fn();
  render(<Component error={error} reset={reset} />);
  const props = vi.mocked(AppErrorBoundary).mock.calls.at(-1)?.[0];
  if (!props) throw new Error('Expected the shared error boundary to render');
  expect(props.appName).toBe('Apps');
  expect(props.reset).toBe(reset);
  props.reset?.();
  expect(reset).toHaveBeenCalledOnce();
  return props.error;
}

describe('Apps route error boundary', () => {
  it('preserves the actual Error instance, stack, digest and cause', () => {
    const cause = new Error('upstream');
    const error = Object.assign(new TypeError('loader failed', { cause }), {
      digest: 'fixture-reference',
    });
    const normalized = renderFailure(error);
    expect(normalized).toBe(error);
    expect(normalized.stack).toBe(error.stack);
    expect(normalized.cause).toBe(cause);
    expect(normalized.digest).toBe('fixture-reference');
  });

  it.each(['failure', '', null, undefined, false, 0, { message: 'untrusted' }])(
    'keeps non-Error thrown value %j as the cause',
    (thrown) => {
      const normalized = renderFailure(thrown);
      expect(normalized).toBeInstanceOf(Error);
      expect(normalized.message).toBe(
        typeof thrown === 'string' ? thrown : 'Unknown error'
      );
      expect(normalized.cause).toBe(thrown);
      expect(normalized.stack).toContain(normalized.message || 'Error');
      expect(normalized.digest).toBeUndefined();
    }
  );

  it('does not coerce or read properties from an unknown thrown object', () => {
    const thrown = {
      get message() {
        throw new Error('message must not be read');
      },
      toString() {
        throw new Error('must not coerce');
      },
    };
    expect(renderFailure(thrown).cause).toBe(thrown);
  });
});
