import { randomBytes } from 'node:crypto';
import { connection, type NextRequest } from 'next/server';
import { MOBILE_CLIENT_TURNSTILE_ACTION } from '@/lib/auth/mobile-client-credential-mint';
import {
  nativeIntegrityMode,
  nativeIntegrityTurnstileParents,
} from '@/lib/native-integrity/runtime';

// Each purpose renders its own Turnstile action, which its verifier requires,
// so a solve for one purpose cannot be replayed at another.
const ACTIONS = {
  // The native client credential mint does not depend on the integrity mode.
  mobile_client_credential: MOBILE_CLIENT_TURNSTILE_ACTION,
  request: 'native_integrity',
} as const;

export async function GET(request: NextRequest) {
  await connection();
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const requestHash = request.nextUrl.searchParams.get('requestHash');
  const purpose = request.nextUrl.searchParams.get('purpose') ?? 'request';
  if (!Object.hasOwn(ACTIONS, purpose))
    return new Response(null, { status: 404 });
  const action = ACTIONS[purpose as keyof typeof ACTIONS];
  if (
    (purpose === 'request' && nativeIntegrityMode() === 'off') ||
    !key ||
    !/^[A-Za-z0-9_-]{43}$/.test(requestHash ?? '')
  )
    return new Response(null, { status: 404 });
  const parents = nativeIntegrityTurnstileParents();
  const parent = request.nextUrl.searchParams.get('parentOrigin');
  if (parent !== null && !parents.includes(parent))
    return new Response(null, { status: 400 });
  const nonce = randomBytes(24).toString('base64');
  const config = JSON.stringify({ action, key, requestHash, parent }).replace(
    /</g,
    '\\u003c'
  );
  return new Response(
    `<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="verification"></div><script nonce="${nonce}">
const config=${config}; let finished=false;
function deliver(payload){if(finished)return;finished=true;const result={...payload,requestHash:config.requestHash};window.__tuturuuuNativeIntegrityResult=result;if(config.parent&&window.parent!==window)window.parent.postMessage({type:'tuturuuu-native-integrity',...result},config.parent);}
window.nativeIntegrityReady=function(){try{const id=turnstile.render('#verification',{sitekey:config.key,action:config.action,cData:config.requestHash,size:'invisible',execution:'execute',retry:'never','refresh-expired':'never',callback:token=>deliver({token}),'error-callback':()=>deliver({error:'unavailable'}),'expired-callback':()=>deliver({error:'expired'})});turnstile.execute(id);}catch{deliver({error:'unavailable'});}};
setTimeout(()=>deliver({error:'unavailable'}),18000);
</script><script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=nativeIntegrityReady&amp;render=explicit" async defer></script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; child-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${parents.join(' ')}`,
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    }
  );
}
