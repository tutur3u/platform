# @tuturuuu/types

Common TypeScript types and interfaces for Tuturuuu Platform. This package provides strongly-typed definitions for all data structures used across the Tuturuuu Platform.

## Installation

```bash
npm install @tuturuuu/types
# or
yarn add @tuturuuu/types
# or
bun add @tuturuuu/types
```

## Usage

```typescript
import { User, Workspace, WorkspaceUser } from '@tuturuuu/types';
// Use type-safe database queries
import { Tables } from '@tuturuuu/types/supabase';

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
bun install
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
