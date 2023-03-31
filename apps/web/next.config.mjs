/** @type {import('next').NextConfig} */
import nextTranslate from 'next-translate-plugin';

const nextConfig = nextTranslate({
  reactStrictMode: true,
  transpilePackages: ['ui'],
});

export default nextConfig;
