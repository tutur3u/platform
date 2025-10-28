# Multi-Account Feature Test Suite

This directory contains comprehensive tests for the multi-account functionality, covering the entire flow from login to account switching and logout.

## Test Files

### 1. `account-switcher-context.test.tsx`
Tests the core multi-account context that manages session storage and account operations.

**Coverage:**
- ✅ Context initialization with empty and existing accounts
- ✅ Adding new accounts with duplicate prevention
- ✅ Removing accounts with auto-switch behavior
- ✅ Switching between accounts
- ✅ Smart logout (single vs multiple accounts)
- ✅ Logout all functionality
- ✅ Workspace context tracking
- ✅ Account refresh operations

**Key Tests:**
- Prevents adding duplicate accounts
- Auto-switches to another account when removing active account
- Switches to another account on logout if multiple exist
- Updates workspace metadata for each account

### 2. `logout-functionality.test.tsx`
Tests logout buttons and their integration with the multi-account system.

**Coverage:**
- ✅ LogoutButton component rendering and behavior
- ✅ LogoutDropdownItem component rendering and behavior
- ✅ Context integration (uses context instead of API calls)
- ✅ Multi-account logout behavior
- ✅ Single account logout behavior

**Key Tests:**
- Logout buttons call context method instead of API
- Maintains multi-account state after logout
- Handles both single and multiple account scenarios

### 3. `add-account-page.test.tsx`
Tests the add-account page flow and error handling.

**Coverage:**
- ✅ Loading state display
- ✅ Successful account addition and redirect
- ✅ Handling duplicate accounts (treats as success)
- ✅ Error handling for genuine failures
- ✅ Missing session error handling
- ✅ ReturnUrl parameter handling
- ✅ Fallback to root when no returnUrl

**Key Tests:**
- Redirects immediately when account already exists (no error flash)
- Uses returnUrl from query params
- Shows error only for genuine failures
- Handles missing sessions gracefully

### 4. `account-switcher-modal.test.tsx`
Tests the account switcher UI component and interactions.

**Coverage:**
- ✅ Account list rendering with metadata
- ✅ Active account badge display
- ✅ Account switching on click
- ✅ Account removal with trash button
- ✅ Search/filter functionality (by name and email)
- ✅ Keyboard navigation (arrow keys, Enter, Escape)
- ✅ Add account button functionality
- ✅ Loading states
- ✅ Last workspace and last active display

**Key Tests:**
- Shows remove button only when multiple accounts exist
- Prevents event propagation on remove click
- Filters accounts case-insensitively
- Navigates with keyboard shortcuts
- Disables interactions during loading

### 5. `login-multi-account-flow.test.tsx`
Tests the login form's multi-account URL handling and redirect logic.

**Coverage:**
- ✅ URL parameter detection (multiAccount, returnUrl)
- ✅ Redirect to /add-account when multiAccount=true
- ✅ Relative vs absolute path handling
- ✅ Error separation (auth vs navigation errors)
- ✅ Fallback behavior on navigation errors
- ✅ Account already exists flow
- ✅ Locale handling (ensures no manual locale in URLs)

**Key Tests:**
- Always redirects to /add-account in multi-account mode
- Treats relative paths as 'web' app
- Separates auth errors from navigation errors
- Redirects immediately when account already exists
- Relies on proxy.ts for locale handling

## Running the Tests

### Run all multi-account tests
```bash
bun test account-switcher-context.test.tsx
bun test logout-functionality.test.tsx
bun test add-account-page.test.tsx
bun test account-switcher-modal.test.tsx
bun test login-multi-account-flow.test.tsx
```

### Run all tests in watch mode
```bash
bun test --watch
```

### Run specific test file
```bash
bun test src/__tests__/account-switcher-context.test.tsx
```

### Run with coverage
```bash
bun run test:coverage
```

## Test Architecture

### Mocking Strategy

**Next.js Navigation:**
```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/test-workspace',
}));
```

**Supabase Client:**
```typescript
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  }),
}));
```

**Account Switcher Context:**
```typescript
vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({
    accounts: mockAccounts,
    activeAccountId: 'user-1',
    // ... other methods
  }),
}));
```

### Test Data

Standard mock session:
```typescript
const mockSession: Session = {
  user: {
    id: 'user-1',
    email: 'user1@test.com',
    user_metadata: {
      full_name: 'Test User 1',
      avatar_url: 'https://avatar.test/1.jpg',
    },
  },
  access_token: 'test-access-token-1',
  refresh_token: 'test-refresh-token-1',
  // ...
};
```

## Coverage Goals

- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

## Critical Test Scenarios

### 1. Happy Path: Adding Second Account
1. User has Account A active
2. Clicks "Add Account"
3. Current session (Account A) is saved
4. Navigates to `/login?multiAccount=true&returnUrl=/workspace`
5. Logs in with Account B
6. Redirects to `/add-account?returnUrl=/workspace`
7. Account B is added to store
8. Redirects to `/workspace`
9. Both accounts now in switcher

### 2. Edge Case: Adding Existing Account
1. User has Account A active
2. Attempts to add Account A again
3. Detects "already exists" error
4. **Treats as success** and redirects immediately
5. No error flash shown to user

### 3. Logout with Multiple Accounts
1. User has Accounts A and B
2. Account A is active
3. User clicks "Logout"
4. Account A is removed from store
5. **Automatically switches to Account B**
6. User stays logged in, no redirect to login page

### 4. Logout with Single Account
1. User has only Account A
2. User clicks "Logout"
3. Account A is removed from store
4. No other accounts available
5. Signs out from Supabase
6. Redirects to login page

## Known Limitations

1. **LocalStorage Timing:** Tests use delays to simulate localStorage write completion. Real implementation may vary.
2. **Router Mocks:** Some navigation behaviors are mocked and may not fully represent production.
3. **Session Refresh:** Tests don't fully simulate token refresh flows.

## Adding New Tests

When adding new multi-account features, ensure you test:

1. **Context Integration:** Does it interact correctly with `useAccountSwitcher()`?
2. **Error Handling:** What happens when the account doesn't exist, or operations fail?
3. **Edge Cases:** Duplicate accounts, no accounts, single account scenarios
4. **UI States:** Loading, error, success states
5. **Navigation:** Proper redirects with multiAccount flag and returnUrl

## Debugging Tests

### Enable verbose logging
```bash
DEBUG=* bun test account-switcher-context.test.tsx
```

### Run single test
```bash
bun test -t "should add a new account successfully"
```

### Check test output
All tests include console.log statements that can be enabled by setting `DEBUG=true` in the test environment.

## CI/CD Integration

These tests are automatically run as part of the CI pipeline:
- On every pull request
- Before deployment to production
- As part of the `bun run buildx` command

## Maintenance

- **Review quarterly:** Ensure tests match current implementation
- **Update mocks:** When Supabase or Next.js APIs change
- **Add regression tests:** When bugs are found in production
- **Keep coverage high:** Aim for >80% across all metrics
