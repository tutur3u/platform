# @tuturuuu/supabase

> Supabase client and utilities for Next.js applications with SSR support, cookie handling, and TypeScript type safety.

[![npm version](https://badge.fury.io/js/@tuturuuu%2Fsupabase.svg)](https://www.npmjs.com/package/@tuturuuu/supabase)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **Next.js Optimized**: Built specifically for Next.js 16+ with App Router support
- 🔒 **SSR-Safe**: Proper server-side rendering with cookie-based authentication
- 🎯 **Type-Safe**: Full TypeScript support with generated database types
- 🔄 **Realtime**: Built-in realtime subscription utilities
- 👤 **User Management**: Helper functions for user operations
- 🛡️ **Secure**: Admin client for server-side operations with service key

## Installation

```bash
npm install @tuturuuu/supabase
# or
yarn add @tuturuuu/supabase
# or
pnpm add @tuturuuu/supabase
# or
bun add @tuturuuu/supabase
```

### Peer Dependencies

This package requires the following peer dependencies:

- `next` >= 15.0.0
- `react` >= 18.0.0
- `react-dom` >= 18.0.0

## Environment Variables

Set the following environment variables in your `.env.local` or `.env` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
SUPABASE_SECRET_KEY=your-service-role-key  # For admin operations only
```

## Usage

### Client-Side (Browser)

Use in Client Components for browser-side operations:

```typescript
'use client';

import { createClient } from '@tuturuuu/supabase/next/client';

export default function ClientComponent() {
  const supabase = createClient();

  // Use the client for queries
  const { data, error } = await supabase
    .from('your_table')
    .select('*');

  return <div>{/* Your component */}</div>;
}
```

### Server-Side (Server Components & Actions)

Use in Server Components and Server Actions:

```typescript
import { createClient } from '@tuturuuu/supabase/next/server';

export default async function ServerComponent() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('your_table')
    .select('*');

  return <div>{/* Your component */}</div>;
}
```

### Admin Client (Server-Only)

For server-side operations that require service role privileges:

```typescript
import { createAdminClient } from '@tuturuuu/supabase/next/server';

// In API routes or Server Actions
export async function serverAction() {
  const adminClient = await createAdminClient();

  // Bypass RLS policies
  const { data, error } = await adminClient
    .from('your_table')
    .select('*');

  return data;
}
```

### User Utilities

Helper functions for common user operations:

```typescript
import { getUser, getCurrentUser } from '@tuturuuu/supabase/next/user';

// Get authenticated user (returns null if not authenticated)
const user = await getUser();

// Get authenticated user (throws error if not authenticated)
const user = await getCurrentUser();
```

### Realtime Subscriptions

Subscribe to realtime database changes:

```typescript
'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect } from 'react';

export default function RealtimeComponent() {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('table-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'your_table'
      }, (payload) => {
        console.log('Change received!', payload);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return <div>{/* Your component */}</div>;
}
```

### API Proxy

Proxy requests through your API routes for enhanced security:

```typescript
import { createProxyClient } from '@tuturuuu/supabase/next/proxy';

// In your API route
export async function POST(request: Request) {
  const supabase = await createProxyClient(request);

  // Use the client
  const { data, error } = await supabase
    .from('your_table')
    .select('*');

  return Response.json({ data, error });
}
```

## API Reference

### `createClient()`

Creates a Supabase client for browser-side operations.

**Returns:** `SupabaseClient<Database>`

### `createClient()` (Server)

Creates a Supabase client for server-side operations with cookie handling.

**Returns:** `Promise<SupabaseClient<Database>>`

### `createAdminClient(options?)`

Creates a Supabase admin client with service role privileges.

**Options:**

- `noCookie?: boolean` - Disable cookie handling (default: false)

**Returns:** `Promise<SupabaseClient<Database>>`

### `getUser()`

Gets the currently authenticated user, returns null if not authenticated.

**Returns:** `Promise<User | null>`

### `getCurrentUser()`

Gets the currently authenticated user, throws error if not authenticated.

**Returns:** `Promise<User>`

**Throws:** Error if user is not authenticated

### `createProxyClient(request)`

Creates a Supabase client from an incoming request for API proxying.

**Parameters:**

- `request: Request` - The incoming request object

**Returns:** `Promise<SupabaseClient<Database>>`

## TypeScript

This package is written in TypeScript and includes type definitions. For best experience, generate types from your Supabase schema:

```bash
# If using Supabase CLI
npx supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

Then use them with your client:

```typescript
import type { Database } from './types/supabase';
import { createClient } from '@tuturuuu/supabase/next/client';

const supabase = createClient<Database>();
```

## Best Practices

1. **Client vs Server**: Always use the appropriate client creation function:
   - Browser: `createClient()` from `/next/client`
   - Server: `createClient()` from `/next/server`
   - Admin: `createAdminClient()` from `/next/server`

2. **Security**: Never expose the service role key in client-side code. Use `createAdminClient()` only in server-side contexts.

3. **Error Handling**: Always check for errors when making Supabase queries:

   ```typescript
   const { data, error } = await supabase.from('table').select('*');
   if (error) {
     console.error('Error:', error);
     return;
   }
   ```

4. **Realtime Cleanup**: Always unsubscribe from realtime channels to prevent memory leaks:

   ```typescript
   useEffect(() => {
     const channel = supabase.channel('my-channel');
     // ... subscription setup
     return () => channel.unsubscribe();
   }, []);
   ```

## Development

### Monorepo Development

**Important:** This package must be built before it can be used by other packages in the monorepo.

> **Note for New Contributors:** After cloning the repository or switching branches, you must build this package first. The `dist/` folder is git-ignored and won't be present until you build it.

```bash
# Install dependencies
bun install

# Build the package (required before first use)
bun run build

# Run tests
bun run test

# Type check
bun run type-check

# Clean build artifacts
bun run clean
```

### Watch Mode (During Active Development)

If you're actively working on this package, you can set up watch mode:

```bash
# Terminal 1: Watch and rebuild on changes
bun run dev

# Terminal 2: Run your app that depends on this package
cd ../../apps/web
bun dev
```

### Monorepo Build Order

When building the entire monorepo, this package should be built before dependent packages:

```bash
# From monorepo root
bun run build  # Turborepo handles the correct build order
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](https://github.com/tutur3u/platform/blob/main/CONTRIBUTING.md) for details.

## License

MIT © [Tuturuuu](https://github.com/tutur3u)

## Links

- [GitHub Repository](https://github.com/tutur3u/platform)
- [npm Package](https://www.npmjs.com/package/@tuturuuu/supabase)
- [Issue Tracker](https://github.com/tutur3u/platform/issues)
- [Supabase Documentation](https://supabase.com/docs)
