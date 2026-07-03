import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Automatically cleanup after each test to prevent React 19 scheduler issues
// and cross-test DOM leakage.
afterEach(() => {
  cleanup();
});
