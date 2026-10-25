import { TokenVerifier } from '@tuturuuu/auth/cross-app/token-verifier';
import { appPath } from '@tuturuuu/start-bridge/app-url';

export default function VerifyTokenPage() {
  return (
    <TokenVerifier verifyApiPath={appPath('/api/auth/verify-app-token')} />
  );
}
