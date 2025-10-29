# Secure Email Display Implementation

## Overview

This document explains how we've implemented secure email display for the multi-account feature while minimizing PII exposure.

## Security Approach

### Problem
Previously, email addresses were stored in plaintext in the `AccountMetadata` object in localStorage, making them vulnerable to XSS attacks.

### Solution
We now store emails **only in the encrypted session** and decrypt them on-demand for display:

1. **Email Storage**: Emails are stored only in `session.user.email` within the encrypted session
2. **Email Retrieval**: When displaying accounts, we decrypt sessions to extract emails
3. **Type Safety**: New `StoredAccountWithEmail` type for accounts with decrypted emails

## Implementation Details

### Backend (`packages/auth/src/multi-session/`)

#### 1. Updated Types (`types.ts`)
```typescript
export interface AccountMetadata {
  // Email removed from here - no longer in plaintext metadata
  lastWorkspaceId?: string;
  lastRoute?: string;
  lastActiveAt: number;
  displayName?: string;
  avatarUrl?: string;
}

export interface StoredAccountWithEmail extends StoredAccount {
  /** Email address retrieved from encrypted session (requires decryption) */
  email: string;
}
```

#### 2. New Method in SessionStore (`session-store.ts`)
```typescript
async getAccountsWithEmail(): Promise<Array<StoredAccount & { email: string }>> {
  // Decrypts each session to extract email for display
  // More secure than plaintext storage
}
```

### Frontend (`apps/web/src/`)

#### 1. Context (`context/account-switcher-context.tsx`)
- Changed accounts type from `StoredAccount[]` to `StoredAccountWithEmail[]`
- Updated `refreshAccounts()` to use `getAccountsWithEmail()`
- Emails are decrypted once when loading accounts, not stored in plaintext

#### 2. UI Components
- `account-item.tsx`: Updated to use `StoredAccountWithEmail` and display email
- `account-switcher-modal.tsx`: Search by email works, email displayed under name

## Security Benefits

1. **Encrypted at Rest**: Emails stored encrypted in localStorage
2. **Decryption Required**: XSS attacks must actively decrypt to access emails
3. **No Plaintext Metadata**: Emails not cached in plaintext metadata
4. **Clear Documentation**: Security warnings and notes throughout code

## Security Warnings

While this approach is more secure than plaintext storage, note that:

- The encryption key is also in localStorage
- XSS attacks that can run JavaScript can still decrypt and access emails
- This provides defense-in-depth, not absolute protection

For stronger security, consider:
1. User-provided passcodes gating decryption (PBKDF2/Argon2)
2. WebAuthn for key unwrapping
3. Non-extractable CryptoKeys in memory

## Testing

Tests updated to use the new `StoredAccountWithEmail` type with email at the top level:

```typescript
const mockAccounts = [
  {
    id: 'user-1',
    encryptedSession: 'encrypted-session-1',
    email: 'user1@test.com', // Now at top level, not in metadata
    metadata: {
      displayName: 'User One',
      // No email here
    },
  },
];
```

## Migration Notes

No migration needed - existing encrypted sessions already contain email in `session.user.email`. We just changed where we access it from.

## Files Changed

### Packages
- `packages/auth/src/multi-session/types.ts`
- `packages/auth/src/multi-session/session-store.ts`
- `packages/auth/src/multi-session/session-crypto.ts`

### Frontend
- `apps/web/src/context/account-switcher-context.tsx`
- `apps/web/src/components/account-switcher/account-item.tsx`
- `apps/web/src/components/account-switcher/account-switcher-modal.tsx`

### Tests
- `apps/web/src/__tests__/account-switcher-modal.test.tsx`
- Other test files may need updates

## Benefits for End Users

Users can now clearly distinguish between accounts by email:
- Work emails vs personal emails
- Multiple accounts from same organization
- Clear account identification in switcher UI

While maintaining better security posture than plaintext storage.
