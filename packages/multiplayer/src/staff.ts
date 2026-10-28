import type { Identity } from './index';

export function staff(identity: Pick<Identity, 'email' | 'staffVerified'>) {
  return (
    identity.staffVerified === true &&
    typeof identity.email === 'string' &&
    /^[^@\s]+@tuturuuu\.com$/i.test(identity.email)
  );
}
