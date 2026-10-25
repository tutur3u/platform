import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import {
  MAIL_FUNCTION_BASE,
  MAIL_LEGACY_FUNCTION_BASE,
} from './mail-api-policy';
import { mailAppPath } from './mail-mount';

export function applyMailResponsePolicy(request: Request, response: Response) {
  const path = mailAppPath(request) ?? new URL(request.url).pathname;
  const result = new Response(response.body, response);
  result.headers.set('X-Robots-Tag', PRIVATE_ROBOTS_HEADER);
  if (
    !/^\/api\/v1\/workspaces\/[^/]+\/external-projects\/assets\/[^/]+\/webgl(?:\/|$)/u.test(
      path
    )
  ) {
    const ownerCsp = result.headers.get('Content-Security-Policy');
    if (ownerCsp === null)
      result.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    if (!result.headers.has('X-Frame-Options')) {
      const selfFramedAttachment =
        (response.status === 200 || response.status === 206) &&
        /^\/api\/v1\/workspaces\/[^/]+\/mail\/mailboxes\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+\/?$/u.test(
          path
        ) &&
        ownerCsp !== null &&
        /(?:^|;)\s*frame-ancestors\s+'self'\s*(?:;|$)/iu.test(ownerCsp);
      result.headers.set(
        'X-Frame-Options',
        selfFramedAttachment ? 'SAMEORIGIN' : 'DENY'
      );
    }
  }
  if (
    path.startsWith(`${MAIL_FUNCTION_BASE}/`) ||
    path.startsWith(`${MAIL_LEGACY_FUNCTION_BASE}/`) ||
    (!path.startsWith('/assets/') &&
      path !== '/api' &&
      !path.startsWith('/api/') &&
      !/\.[a-z0-9]+$/iu.test(path))
  )
    result.headers.set('Cache-Control', 'private, no-store');
  return result;
}
