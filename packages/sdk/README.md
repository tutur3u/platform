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

- ✅ **Bun CLI** - Use `ttr` for browser login, workspace discovery, task workflows, and finance CRUD
- ✅ **Headless Login** - Copy a short-lived CLI token from the browser when no local browser callback is available
- ✅ **Storage Operations** - Upload, download, list, delete files and folders
- ✅ **Direct Uploads** - Generate signed URLs for client-side uploads without proxying
- ✅ **Document Management** - Create, read, update, delete workspace documents
- ✅ **Signed URLs** - Generate temporary shareable links for files
- ✅ **Image Resizing** - Request Supabase-powered image transforms on share/download
- ✅ **Storage Analytics** - Track usage, file counts, and limits
- ✅ **EPM Delivery** - Load normalized external-project payloads and adapter-specific loading data
- ✅ **EPM Management** - Manage collections, entries, workflow queues, imports, duplication, and preview with API keys
- ✅ **Type-Safe** - Full TypeScript support with type inference
- ✅ **Error Handling** - Comprehensive error classes for all scenarios
- ✅ **Validation** - Built-in input validation with Zod schemas

## API Reference

## CLI

The package ships a native Bun-powered CLI. `ttr` is the primary command, with
`tuturuuu` and `tutur3u` as aliases.

```bash
ttr --help
ttr login
ttr upgrade
ttr --version
ttr whoami
ttr workspaces
ttr workspaces use
ttr boards
ttr boards use
ttr lists use
ttr tasks use
ttr tasks --board <board-id>
ttr tasks --compact
ttr tasks create "Add Tuturuuu CLI"
ttr tasks create --list <list-id> --name "Write release notes"
ttr tasks done <task-id>
ttr tasks close <task-id>
ttr tasks update <task-id> --json-payload '{"completed":true}'
ttr finance wallets
ttr finance transactions --page-size 10
ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09
ttr finance budgets status
```

Login opens the browser and creates a fresh session specifically labeled for
the Tuturuuu CLI. The terminal and browser confirmation page show the signed-in
account email when the web session exposes it. For headless environments, use
copy-token mode:

```bash
ttr login --copy
```

The CLI stores its session and selected workspace, board, list, task, label, and
project in the OS-specific app config directory. `personal` is the default
workspace after login and when no workspace has been selected. Set
`TUTURUUU_CONFIG` to use a custom config file, or
`ttr config set-base-url <url>` to target a non-production Tuturuuu instance.
Once per hour, the CLI checks the npm registry for a newer `tuturuuu` release
and prints update instructions to stderr when one is available. Use `ttr
upgrade` to run `bun i -g tuturuuu`. Use
`--no-update-check` for a single command or set `TUTURUUU_DISABLE_UPDATE_CHECK=1`
to disable this notification.

CLI sessions are dedicated Supabase sessions labeled `Tuturuuu CLI`, separate
from normal browser sessions. The CLI stores both the access token and refresh
token, refreshes shortly before token expiry, updates the saved config with the
rotated refresh token, and retries once after a `401` response. If refresh fails,
run `ttr login` again to create a fresh dedicated CLI session.

Scoped help is available without login, saved config reads, or update checks:

```bash
ttr --help
ttr upgrade --help
ttr finance --help
ttr finance transactions --help
ttr tasks --help
ttr tasks create --help
ttr tasks done --help
ttr tasks close --help
ttr tasks update --help
ttr workspaces --help
ttr help tasks create
```

Use `ttr whoami` to inspect login state, account email, selected workspace,
selected board/list/task/label/project ids, base URL, config path, and the
`Tuturuuu CLI` session label. For agents, prefer parseable output:

```bash
ttr whoami --json
ttr workspaces --json --no-update-check
ttr tasks --json --no-update-check
```

Task commands cover workspaces, boards, lists, tasks, labels, projects,
relationships, moves, and bulk task updates. Read-oriented groups list by
default, so `ttr tasks` and `ttr workspaces` are equivalent to their explicit
`list` forms. Unscoped `ttr tasks` starts from the personal workspace and lists
personal tasks plus open tasks assigned to the user in other accessible
workspaces; selecting a board/list or passing `--workspace` scopes the result
back to that context. `ttr tasks` shows open tasks by default by excluding rows with
`completed_at` or `closed_at` and by limiting task-list statuses to
`not_started` and `active`. That default hides tasks in `documents`, `review`,
`done`, and `closed` lists, and tasks from archived boards; use `--all`,
`--include-archived`, `--documents`, `--review`, `--done`, `--closed`,
`--include-documents`, `--include-review`, `--include-done`, or
`--include-closed` to adjust that filter. Results are paginated at 50 tasks by
default; use `--page`/`--page-size` or `--limit`/`--offset` to page through
larger task sets. Human-readable task lists show a footer with the total task
count and current page/max page. Add `--compact` to task lists when an agent
only needs the task title, task list name, and per-task workspace name. Task
lists are ordered by priority and due date, with prettier due dates and
configured task-list colors in table output. Use `--json` on read commands when
another agent or script needs machine-readable output. `tasks
create`, `boards create`, and `lists create` accept a quoted positional name as
a shorthand for `--name`. Task CRUD accepts either the task UUID or the board
identifier shown in the UI, such as `VHP-12`; prefixed identifiers resolve
within the selected workspace even when another list is selected. Marking a task
completed stamps `completed_at` so Tuturuuu moves it to the first
`done` list; pass `--list <done-list-id>` or include `list_id` in
`--json-payload` to choose another done destination. Use `ttr tasks done
[task-id]` as the quick shortcut. Use `ttr tasks close [task-id]` to stamp
`closed_at`; pass `--list <closed-list-id>` to choose a specific closed
destination.

Finance commands cover workspace wallets, transactions, categories, budgets,
and recurring transactions through the same authenticated internal APIs as the
web app. Use `--workspace` or `--ws` to target a specific workspace, and
`--json-payload` to pass explicit create/update fields for scripted workflows.
Finance list output is paginated by default; use `--page`/`--page-size` or
`--limit`/`--offset` to move through larger result sets.

Common finance examples:

```bash
ttr finance wallets
ttr finance wallets --page 2 --page-size 10
ttr finance wallets create "Cash" --currency VND --balance 0 --type STANDARD
ttr finance wallets update <wallet-id> --name "Operating Cash"
ttr finance transactions --page-size 10
ttr finance transactions --limit 25 --offset 50
ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09
ttr finance transactions update <transaction-id> --category <category-id>
ttr finance transactions export --wallets <wallet-id> --start 2026-05-01 --end 2026-05-31
ttr finance categories create "Travel" --expense --color blue
ttr finance budgets create "Marketing" --amount 1000000 --period monthly --start-date 2026-05-01
ttr finance budgets status
ttr finance recurring create "Rent" --amount 5000000 --wallet <wallet-id> --frequency monthly --start-date 2026-05-01
ttr finance recurring upcoming --days-ahead 30
```

Common task examples:

```bash
ttr tasks
ttr tasks --compact
ttr tasks --json --no-update-check
ttr tasks create "Add Tuturuuu CLI"
ttr tasks create --list <list-id> --name "Write release notes"
ttr tasks done VHP-12
ttr tasks done <task-id> --list <done-list-id>
ttr tasks close VHP-12
ttr tasks close <task-id> --list <closed-list-id>
ttr tasks move
ttr tasks move VHP-12 --list <done-list-id>
ttr tasks update VHP-12 --json-payload '{"completed":true}'
ttr tasks update <task-id> --list <done-list-id> --json-payload '{"completed":true}'
```

For terminal workflows, omit an id from `use`, `get`, `update`, `delete`, or
`move` commands to pick a workspace, board, list, task, label, or project with
the keyboard. The interactive picker shows one-based indexes, colored badges
such as `[FREE] Tuturuuu` and `[PRO] Personal`, task-list color swatches, the
selected row, and muted metadata. Use up/down or `j`/`k` to move, space/enter to
select, and escape/`q` to cancel. Interactive selection is disabled for `--json`
output. Use `ttr -v` or `ttr --version` to print the installed CLI version.

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

Resize an image during download:

```typescript
const blob = await client.storage.download('images/photo.png', {
  transform: {
    width: 320,
    height: 180,
    resize: 'cover',
    quality: 80
  }
});
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

#### Create Signed Upload URL

Generate a signed URL for direct file uploads without proxying through your server. Perfect for client-side uploads with progress tracking.

```typescript
// Server-side: Generate signed URL
const { data } = await client.storage.createSignedUploadUrl({
  filename: 'document.pdf',
  path: 'documents',
  upsert: true // overwrite if exists
});

// Send the signed URL to the client
// Client-side: Upload directly to storage
const file = new File(['content'], 'document.pdf');
await fetch(data.signedUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type,
    'x-upsert': 'true'
  }
});
```

#### Share File

```typescript
const { data } = await client.storage.share('documents/report.pdf', {
  expiresIn: 3600 // 1 hour in seconds
});
console.log(data.signedUrl);
```

Resize an image before sharing it:

```typescript
const { data } = await client.storage.share('images/photo.png', {
  expiresIn: 3600,
  transform: {
    width: 320,
    height: 180,
    resize: 'contain',
    quality: 85
  }
});
```

#### Get Analytics

```typescript
const analytics = await client.storage.getAnalytics();
console.log(`Used: ${analytics.data.totalSize} bytes`);
console.log(`Files: ${analytics.data.fileCount}`);
console.log(`Usage: ${analytics.data.usagePercentage}%`);
```

### EPM Delivery

```typescript
const delivery = await client.externalProjects.getDelivery('workspace-id');

if (delivery.loadingData?.adapter === 'yoola') {
  console.log(delivery.loadingData.featuredArtwork?.title);
  console.log(delivery.loadingData.singletonSections.about?.bodyMarkdown);
}

const loadingData =
  await client.externalProjects.getYoolaLoadingData('workspace-id');
console.log(loadingData.artworkCategories);
```

For the Yoola adapter, `artworkCategories` reflects the explicit gallery taxonomy configured on the `singleton-sections/gallery` entry (`profile_data.categoryOptions`), filtered down to categories that currently have artworks.

External apps can also seed assets from their local `public/` folder without holding production Supabase keys:

```typescript
import {
  linkExternalProjectPublicFolderAssets
} from 'tuturuuu';
import { uploadExternalProjectPublicFolderAssets } from 'tuturuuu/external-projects/public-assets';

const linkedManifest = linkExternalProjectPublicFolderAssets(manifest);
const sync = await uploadExternalProjectPublicFolderAssets(
  client.externalProjects,
  workspaceId,
  manifest,
  { publicDir: './public' }
);

console.log(sync.uploaded.length);
console.log(linkedManifest.content.entries[0]?.assets?.[0]?.storagePath);
```

Set `metadata.publicPath`, `metadata.localAssetPath`, `metadata.sourcePublicPath`, or a relative `sourceUrl` on manifest assets. The helper uploads those files through the existing external-project signed upload URL endpoint and rewrites assets to deterministic Drive paths under `external-projects/{adapter}/{collectionSlug}/{entrySlug}/{filename}`.

Yoola-style consumers can also use the helper accessors exported from the SDK:

```typescript
import {
  getYoolaSectionMarkdown,
  getYoolaSingletonSection,
} from 'tuturuuu';

const aboutSection = getYoolaSingletonSection(delivery.loadingData, 'about');
const aboutMarkdown = getYoolaSectionMarkdown(aboutSection);
console.log(aboutSection?.profileData.socialLinks);
console.log(aboutMarkdown);
```

### EPM Management

```typescript
import {
  buildEpmNavigationItems,
  getEpmCollectionNavigationTitle,
} from 'tuturuuu';

const workspaceId = 'workspace-id';
const summary = await client.epm.getSummary(workspaceId);
console.log(summary.counts.published);

const studio = await client.epm.getStudio(workspaceId);
const navItems = buildEpmNavigationItems(studio.collections);
console.log(navItems.map((item) => item.title));
if (studio.collections[0]) {
  console.log(getEpmCollectionNavigationTitle(studio.collections[0]));
}

const entries = await client.epm.listEntries(workspaceId, {
  collectionId: 'collection-id'
});

const draft = await client.epm.createEntry(workspaceId, {
  collection_id: 'collection-id',
  metadata: {},
  profile_data: {},
  slug: 'launch-asset',
  status: 'draft',
  title: 'Launch Asset'
});

await client.epm.bulkUpdateEntries(workspaceId, {
  action: 'schedule',
  entryIds: [draft.id],
  scheduledFor: '2026-04-20T09:00:00.000Z'
});

await client.epm.updateCollection(workspaceId, 'collection-id', {
  config: {
    navigation: {
      href: '/gallery',
      title: 'Archive'
    }
  }
});

await client.epm.updateAsset(workspaceId, 'asset-id', {
  metadata: {
    caption: 'Low-angle scene study built around pressure and steel.'
  }
});

await client.epm.deleteAsset(workspaceId, 'asset-id');
await client.epm.deleteEntry(workspaceId, draft.id);
```

For Yoola-style integrations, set `collection.config.navigation.title` from EPM to drive external navigation labels while keeping the collection title available for operator-facing admin surfaces. `buildEpmNavigationItems(...)` returns enabled collections with the resolved navigation title plus any configured `href`/visibility hints.

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

### EPM Delivery

Load a published external-project payload:

```typescript
import { ExternalProjectsClient } from 'tuturuuu';

const externalProjects = new ExternalProjectsClient({
  baseUrl: 'https://tuturuuu.com/api/v1'
});

const payload = await externalProjects.getDelivery('workspace-id');

if (payload.loadingData?.adapter === 'yoola') {
  console.log(payload.loadingData.featuredArtwork?.title);
  console.log(payload.loadingData.loreCapsules.length);
}
```

Load preview delivery with a workspace API key:

```typescript
import { TuturuuuClient } from 'tuturuuu';

const client = new TuturuuuClient('ttr_your_api_key');
const previewPayload = await client.externalProjects.getDelivery('workspace-id', {
  preview: true
});
```

Manage the workspace-facing EPM surface with the authenticated client:

```typescript
import { TuturuuuClient } from 'tuturuuu';

const client = new TuturuuuClient('ttr_your_api_key');

const studio = await client.epm.getStudio('workspace-id');
console.log(studio.collections.length);

const duplicate = await client.epm.duplicateEntry('workspace-id', 'entry-id');
await client.epm.publishEntry('workspace-id', duplicate.id, 'publish');
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
  CreateSignedUploadUrlOptions,
  SignedUploadUrlResponse,
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
