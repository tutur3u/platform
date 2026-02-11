import { TokenVerifier } from '@tuturuuu/auth/cross-app/token-verifier';
import { DEV_MODE } from '@/constants/common';

export default function VerifyTokenPage() {
  return <TokenVerifier devMode={DEV_MODE} />;
}
