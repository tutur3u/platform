# External App - Tuturuuu SDK Demo

This Next.js application demonstrates how to securely integrate the Tuturuuu SDK using server-side API routes.

## Architecture

### Security-First Design

The API key is **never exposed to the client**. Instead, we use a proxy pattern:

```
Client (Browser) → Next.js API Routes (Server) → Tuturuuu SDK → Tuturuuu Platform
```

- **Client**: Makes requests to local API routes (`/api/storage/*`)
- **Server**: API routes use the Tuturuuu SDK with the secret API key
- **Platform**: Tuturuuu platform receives authenticated requests

### API Routes

#### `GET /api/storage/analytics`
Returns storage analytics for the workspace.

#### `GET /api/storage/list?path=<path>&limit=<limit>`
Lists files and folders in the workspace storage.

**Query Parameters:**
- `path` (optional): Folder path to list (e.g., "task-images")
- `limit` (optional): Maximum number of items to return (default: 50)

#### `POST /api/storage/upload`
Uploads a file to workspace storage.

**Form Data:**
- `file`: The file to upload
- `path` (optional): Target folder path
- `upsert`: Whether to overwrite existing files ("true" or "false")

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Create `.env.local`:

```env
# Tuturuuu SDK Configuration (server-side only)
TUTURUUU_API_KEY=ttr_your_api_key_here
TUTURUUU_BASE_URL=http://localhost:7803/api/v1

# Supabase (if needed)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

**Important:** Never use `NEXT_PUBLIC_` prefix for the API key - it must remain server-side only.

### 3. Run Development Server

```bash
bun dev
```

Visit `http://localhost:3001/sdk` to see the demo.

## Features

### Storage Operations

- **View Analytics**: See total files, storage used, and usage percentage
- **List Files**: Browse files at root and in specific folders
- **Upload Files**: Upload files with drag-and-drop or file picker
- **Real-time Updates**: Auto-refresh after successful uploads

### Demo Page (`/sdk`)

The SDK demo page showcases:
1. **Storage Analytics** - File count and total size
2. **Root Files** - Files and folders at workspace root
3. **Task Images** - Files in the "task-images" folder
4. **Upload Widget** - Upload files directly to storage
5. **Refresh Button** - Manually reload data

## Security Considerations

### ✅ What We Do Right

1. **API Key on Server Only**: Never exposed to client browser
2. **Server-Side SDK Calls**: All Tuturuuu SDK operations run on the server
3. **Proxy Pattern**: Client calls local API routes, not external APIs directly
4. **Environment Variables**: Proper use of `.env.local` for secrets

### ❌ What NOT to Do

1. **Never** use `NEXT_PUBLIC_` prefix for API keys
2. **Never** import the SDK in client components
3. **Never** hardcode API keys in source code
4. **Never** commit `.env.local` to version control

## Extending the Demo

To add more SDK features:

1. **Create a new API route** in `/app/api/storage/`
2. **Use the Tuturuuu SDK** on the server side
3. **Call your API route** from the client component

Example:

```typescript
// /app/api/storage/delete/route.ts (server)
import { TuturuuuClient } from 'tuturuuu';
import { NextRequest, NextResponse } from 'next/server';

const tuturuuu = new TuturuuuClient({
  apiKey: process.env.TUTURUUU_API_KEY || '',
  baseUrl: process.env.TUTURUUU_BASE_URL || '',
});

export async function DELETE(request: NextRequest) {
  const { paths } = await request.json();
  const result = await tuturuuu.storage.delete(paths);
  return NextResponse.json(result);
}
```

```typescript
// Client component
const handleDelete = async (paths: string[]) => {
  const response = await fetch('/api/storage/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });

  const result = await response.json();
  // Handle result...
};
```

## Production Deployment

When deploying to production:

1. Set environment variables in your hosting platform (Vercel, Railway, etc.)
2. Use `.env.production` or platform-specific secret management
3. Never commit actual API keys to the repository
4. Rotate API keys periodically for security

## Resources

- [Tuturuuu SDK Documentation](https://docs.tuturuuu.com/reference/packages/sdk)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Environment Variables in Next.js](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
