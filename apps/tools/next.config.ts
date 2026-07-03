import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig = createTuturuuuNextConfig();

export default withNextIntl(nextConfig);
