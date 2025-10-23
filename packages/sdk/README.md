# tuturuuu

Official TypeScript/JavaScript SDK for the Tuturuuu platform.

## Installation

```bash
npm install tuturuuu
# or
yarn add tuturuuu
# or
pnpm add tuturuuu
# or
bun add tuturuuu
```

## Quick Start

```typescript
import { TuturuuuClient } from 'tuturuuu';

// Initialize the client
const client = new TuturuuuClient('ttr_your_api_key');

// List files
const files = await client.storage.list({ path: 'documents' });

// Upload a file
const file = new File(['content'], 'example.txt');
await client.storage.upload(file, { path: 'documents' });

// Create a document
const doc = await client.documents.create({
  name: 'My Document',
  content: { text: 'Hello World' }
});
```

## Features

- ✅ **Storage Operations** - Upload, download, list, delete files and folders
- ✅ **Document Management** - Create, read, update, delete workspace documents
- ✅ **Signed URLs** - Generate temporary shareable links for files
- ✅ **Storage Analytics** - Track usage, file counts, and limits
- ✅ **Type-Safe** - Full TypeScript support with type inference
- ✅ **Error Handling** - Comprehensive error classes for all scenarios
- ✅ **Validation** - Built-in input validation with Zod schemas

## API Reference

### Client Initialization

```typescript
import { TuturuuuClient } from 'tuturuuu';

// Simple initialization
const client = new TuturuuuClient('ttr_your_api_key');

// With custom configuration
const client = new TuturuuuClient({
  apiKey: 'ttr_your_api_key',
  baseUrl: 'https://tuturuuu.com/api/v1', // optional
  timeout: 30000 // optional, default 30s
});
```

### Storage Operations

#### List Files

```typescript
const files = await client.storage.list({
  path: 'documents',
  search: 'report',
  limit: 50,
  offset: 0,
  sortBy: 'created_at',
  sortOrder: 'desc'
});
```

#### Upload File

```typescript
const file = new File(['content'], 'document.pdf');
const result = await client.storage.upload(file, {
  path: 'documents',
  upsert: true // overwrite if exists
});
```

#### Download File

```typescript
const blob = await client.storage.download('documents/report.pdf');
```

#### Delete Files

```typescript
await client.storage.delete([
  'documents/old-report.pdf',
  'images/screenshot.png'
]);
```

#### Create Folder

```typescript
await client.storage.createFolder('documents', 'reports');
```

#### Share File

```typescript
const { data } = await client.storage.share('documents/report.pdf', {
  expiresIn: 3600 // 1 hour in seconds
});
console.log(data.signedUrl);
```

#### Get Analytics

```typescript
const analytics = await client.storage.getAnalytics();
console.log(`Used: ${analytics.data.totalSize} bytes`);
console.log(`Files: ${analytics.data.fileCount}`);
console.log(`Usage: ${analytics.data.usagePercentage}%`);
```

### Document Operations

#### List Documents

```typescript
const docs = await client.documents.list({
  search: 'meeting',
  limit: 20,
  offset: 0,
  isPublic: false
});
```

#### Create Document

```typescript
const doc = await client.documents.create({
  name: 'Meeting Notes',
  content: { text: 'Discussion points...' },
  isPublic: false
});
```

#### Get Document

```typescript
const doc = await client.documents.get('document-id-123');
```

#### Update Document

```typescript
const doc = await client.documents.update('document-id-123', {
  name: 'Updated Meeting Notes',
  content: { text: 'New content...' }
});
```

#### Delete Document

```typescript
await client.documents.delete('document-id-123');
```

#### Search Documents

```typescript
const results = await client.documents.search('meeting notes');
```

## Error Handling

The SDK provides specific error classes for different scenarios:

```typescript
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  NetworkError,
  ValidationError
} from 'tuturuuu';

try {
  await client.storage.upload(file);
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid API key
  } else if (error instanceof AuthorizationError) {
    // Insufficient permissions
  } else if (error instanceof NotFoundError) {
    // Resource not found
  } else if (error instanceof ConflictError) {
    // Resource already exists
  } else if (error instanceof RateLimitError) {
    // Rate limit exceeded
  } else if (error instanceof NetworkError) {
    // Network or timeout error
  } else if (error instanceof ValidationError) {
    // Invalid input
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  StorageObject,
  Document,
  ListStorageOptions,
  UploadOptions,
  ShareOptions,
  CreateDocumentData
} from 'tuturuuu';
```

## Examples

See the [examples](./examples) directory for complete usage examples:

- [basic-usage.ts](./examples/basic-usage.ts) - Basic operations
- [error-handling.ts](./examples/error-handling.ts) - Error handling patterns

## Security Best Practices

### ⚠️ Never Expose API Keys Client-Side

API keys should **NEVER** be exposed to the browser. Always use server-side code:

#### ❌ **WRONG** - Client-Side Usage (Insecure)
```typescript
// BAD: API key exposed in browser
const client = new TuturuuuClient(process.env.NEXT_PUBLIC_API_KEY); // NEVER do this!
```

#### ✅ **CORRECT** - Server-Side Usage (Secure)

**Option 1: Next.js API Routes** (Recommended for web apps)
```typescript
// app/api/storage/list/route.ts (SERVER-SIDE)
import { TuturuuuClient } from 'tuturuuu';
import { NextResponse } from 'next/server';

const client = new TuturuuuClient(process.env.TUTURUUU_API_KEY);

export async function GET(request: Request) {
  const files = await client.storage.list({ limit: 50 });
  return NextResponse.json(files);
}
```

Then call from your client:
```typescript
// Client component (SAFE)
const response = await fetch('/api/storage/list');
const files = await response.json();
```

**Option 2: Node.js Backend**
```typescript
// server.js
import { TuturuuuClient } from 'tuturuuu';
import express from 'express';

const client = new TuturuuuClient(process.env.TUTURUUU_API_KEY);
const app = express();

app.get('/api/files', async (req, res) => {
  const files = await client.storage.list();
  res.json(files);
});
```

**Option 3: Serverless Functions**
```typescript
// netlify/functions/storage.ts
import { TuturuuuClient } from 'tuturuuu';

export const handler = async () => {
  const client = new TuturuuuClient(process.env.TUTURUUU_API_KEY);
  const files = await client.storage.list();

  return {
    statusCode: 200,
    body: JSON.stringify(files),
  };
};
```

### Security Checklist

- ✅ Use server-side API routes or backend servers
- ✅ Store API keys in environment variables (`.env.local`, never `.env`)
- ✅ Add `.env.local` to `.gitignore`
- ✅ Use `process.env.VARIABLE` (not `process.env.NEXT_PUBLIC_VARIABLE`)
- ✅ Rotate API keys periodically
- ❌ Never commit API keys to version control
- ❌ Never use `NEXT_PUBLIC_` prefix for API keys
- ❌ Never hardcode API keys in source code
- ❌ Never expose API keys in client-side JavaScript

## API Key Management

To use this SDK, you need a Tuturuuu API key:

1. Log in to your Tuturuuu workspace
2. Navigate to Settings → API Keys
3. Click "Create API Key"
4. Set a descriptive name
5. Assign a Workspace Role (determines permissions)
6. Optionally set an expiration date
7. Copy the generated key (starts with `ttr_`)

**Important:** Keep your API key secure and never commit it to version control.

### Permissions

API keys inherit permissions from their assigned **Workspace Role**:

- **Storage Operations** (list, upload, download, delete, folders, share, analytics) require `manage_drive` permission
- **Document Operations** (list, create, get, update, delete, search) require `manage_documents` permission

To modify what an API key can do, update its assigned role's permissions in Settings → Roles.

## Example Project

See the complete example in [`apps/external`](../../apps/external) which demonstrates:
- ✅ Secure server-side API routes
- ✅ File upload functionality
- ✅ Storage analytics dashboard
- ✅ Proper environment variable handling
- ✅ Error handling and loading states

## License

MIT

## Support

- Documentation: <https://docs.tuturuuu.com>
- Issues: <https://github.com/tutur3u/platform/issues>
- Discord: <https://discord.gg/tuturuuu>
