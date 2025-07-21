import { DEV_MODE } from '@/constants/common';
import { TokenVerifier } from '@tuturuuu/auth/cross-app/token-verifier';

export default function VerifyTokenPage() {
  return <TokenVerifier devMode={DEV_MODE} />;
}
