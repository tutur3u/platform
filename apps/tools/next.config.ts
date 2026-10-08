import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = createTuturuuuNextConfig({ seoApp: 'tools' });

export default withNextIntl(nextConfig);
