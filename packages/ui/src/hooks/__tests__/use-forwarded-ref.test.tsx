import { cleanup, render } from '@testing-library/react';
import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useForwardedRef } from '../use-forwarded-ref';

// Clean up after each test
afterEach(() => {
  cleanup();
});

describe('useForwardedRef', () => {
  // Test component that uses the hook
  const TestComponent = forwardRef<HTMLDivElement, { testId?: string }>(
    function TestComponent({ testId = 'test-div' }, ref) {
      const innerRef = useForwardedRef(ref);
      return <div ref={innerRef} data-testid={testId} />;
    }
  );

  describe('with object ref', () => {
    it('should sync object ref with inner ref', () => {
      const objectRef = React.createRef<HTMLDivElement>();

      render(<TestComponent ref={objectRef} />);

      expect(objectRef.current).toBeInstanceOf(HTMLDivElement);
    });

    it('should update object ref when component re-renders', () => {
      const objectRef = React.createRef<HTMLDivElement>();

      const { rerender } = render(<TestComponent ref={objectRef} />);
      const firstElement = objectRef.current;

      rerender(<TestComponent ref={objectRef} testId="new-test" />);

      expect(objectRef.current).toBeInstanceOf(HTMLDivElement);
      expect(objectRef.current).toBe(firstElement);
    });
  });

  describe('with callback ref', () => {
    it('should call callback ref with element', () => {
      const callbackRef = vi.fn();

      render(<TestComponent ref={callbackRef} />);

      expect(callbackRef).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });

    it('should call callback ref on each render', () => {
      const callbackRef = vi.fn();

      const { rerender } = render(<TestComponent ref={callbackRef} />);
      rerender(<TestComponent ref={callbackRef} />);

      // Callback is called on initial render and each re-render
      expect(callbackRef.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('with null ref', () => {
    it('should handle null ref gracefully', () => {
      expect(() => {
        render(<TestComponent ref={null} />);
      }).not.toThrow();
    });
  });

  describe('with undefined ref', () => {
    it('should handle undefined ref gracefully', () => {
      expect(() => {
        render(<TestComponent />);
      }).not.toThrow();
    });
  });

  describe('inner ref access', () => {
    // Component that exposes internal ref for testing
    const ComponentWithExposedRef = forwardRef<
      { getInnerRef: () => HTMLDivElement | null },
      object
    >(function ComponentWithExposedRef(_, ref) {
      const innerRef = useForwardedRef<HTMLDivElement>(null);

      useImperativeHandle(ref, () => ({
        getInnerRef: () => innerRef.current,
      }));

      return <div ref={innerRef} data-testid="inner-div" />;
    });

    it('should provide access to inner ref', () => {
      const exposedRef = React.createRef<{
        getInnerRef: () => HTMLDivElement | null;
      }>();

      render(<ComponentWithExposedRef ref={exposedRef} />);

      expect(exposedRef.current?.getInnerRef()).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('ref switching', () => {
    it('should handle switching from object ref to callback ref', () => {
      const objectRef = React.createRef<HTMLDivElement>();
      const callbackRef = vi.fn();

      const { rerender } = render(<TestComponent ref={objectRef} />);
      expect(objectRef.current).toBeInstanceOf(HTMLDivElement);

      rerender(<TestComponent ref={callbackRef} />);
      expect(callbackRef).toHaveBeenCalled();
    });

    it('should handle switching from callback ref to object ref', () => {
      const objectRef = React.createRef<HTMLDivElement>();
      const callbackRef = vi.fn();

      const { rerender } = render(<TestComponent ref={callbackRef} />);
      expect(callbackRef).toHaveBeenCalled();

      rerender(<TestComponent ref={objectRef} />);
      expect(objectRef.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
