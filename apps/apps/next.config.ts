import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = createTuturuuuNextConfig({ seoApp: 'apps' });

export default withNextIntl(nextConfig);
