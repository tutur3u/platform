import { TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS } from '@tuturuuu/utils/portless';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: [...TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS],
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withNextIntl(nextConfig);
