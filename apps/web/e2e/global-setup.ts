import { assertSafeE2EEnvironment } from './helpers/environment';

export default async function globalSetup() {
  assertSafeE2EEnvironment();
}
