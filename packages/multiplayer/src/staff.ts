import type { Identity } from './index';

/** Address cleanup does not grant authority; actions require staff(currentIdentity). */
export function hasStaffAddress(email: string | null) {
  return typeof email === 'string' && /^[^@\s]+@tuturuuu\.com$/i.test(email);
}

export function staff(identity: Pick<Identity, 'email' | 'staffVerified'>) {
  return identity.staffVerified === true && hasStaffAddress(identity.email);
}
