import { describe, expect, it } from 'vitest';
import { isScannerProbe, scannerProbeResponse } from './scanner-probe';

describe('isScannerProbe', () => {
  it.each([
    '/wp-login.php',
    '/xmlrpc.php',
    '//xmlrpc.php',
    '/wp-config.php.bak',
    '/dump.sql',
    '/backup.old',
    '/.env',
    '/.env.production',
    '/.git/config',
    '/admin/.aws/credentials',
    '/index.ASPX',
    '/config.json',
    '/Credentials.json',
    '/service-account.json',
    '/.npmrc',
  ])('matches %s', (path) => {
    expect(isScannerProbe(path)).toBe(true);
  });

  it.each([
    '/',
    '/login',
    '/en/login',
    '/personal/tasks',
    '/wp-team/tasks',
    '/wordpress/tasks',
    '/wp-admin',
    '/en/phpmyadmin/settings',
    '/cgi-bin',
    '/server-status',
    '/meet/personal/meetings',
    '/assets/index-abc.js',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/.well-known/security.txt',
    '/.well-known/x.php',
    '/api/v1/meetings/m/collaboration/preview/3000/index.php',
    '/meet/api/v1/x.sql',
    '/download/cli',
    '/install.sh',
    '/version',
    '/license.txt',
    '/drive/config.json',
    '/site.webmanifest',
  ])('leaves %s to the apps', (path) => {
    expect(isScannerProbe(path)).toBe(false);
  });
});

describe('scannerProbeResponse', () => {
  it('is a small cacheable 404', async () => {
    const response = scannerProbeResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('x-gateway-cache')).toBe('PROBE');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(await response.text()).toBe('Not Found');
  });
});
