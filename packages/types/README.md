# @tutur3u/types

Common TypeScript types and interfaces for Tuturuuu Platform. This package provides strongly-typed definitions for all data structures used across the Tuturuuu Platform.

## Installation

```bash
npm install @tutur3u/types
# or
yarn add @tutur3u/types
# or
pnpm add @tutur3u/types
```

## Usage

```typescript
import { User, Workspace, WorkspaceUser } from '@tutur3u/types';
// Use type-safe database queries
import { Tables } from '@tutur3u/types/supabase';

type AIChat = Tables<'ai_chats'>;
```

## Available Types

This package includes TypeScript definitions for:

- Core entities (User, Workspace, etc.)
- Database tables and relationships
- API responses and requests
- Common utilities and helpers

Some key type categories:

- **Users & Authentication**: `User`, `UserRole`, `WorkspaceUser`
- **Workspaces**: `Workspace`, `WorkspaceConfig`, `WorkspaceSecret`
- **Features**: `Task`, `Calendar`, `Product`, `Invoice`
- **Database**: Direct table types via `Tables<'table_name'>`

## Development

```bash
# Install dependencies
pnpm install
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
