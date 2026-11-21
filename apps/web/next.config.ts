import path from 'node:path';
import { getOfflineTurbopackConfig } from '@tuturuuu/offline/config';
import createNextIntlPlugin from 'next-intl/plugin';
import { generate as generatePublicSeoRoutes } from '../../scripts/generate-public-seo-routes';
import { createWebNextConfig } from './next-config.web';

// Discover current indexable pages before configuring HTTP indexing boundaries.
const publicSeoPaths = generatePublicSeoRoutes();

const withNextIntl = createNextIntlPlugin();
const offlineConfig = getOfflineTurbopackConfig({
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  projectRoot: __dirname,
});

export default withNextIntl(
  createWebNextConfig({ publicSeoPaths, offlineConfig })
);
