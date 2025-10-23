# SDK Example Page Structure

This directory contains a well-organized example demonstrating the Tuturuuu SDK for storage operations.

## Directory Structure

```
sdk/
├── components/           # Reusable UI components
│   ├── error-display.tsx       # Error state display
│   ├── file-card.tsx          # Individual file card
│   ├── file-grid.tsx          # Grid of files with actions
│   ├── file-list.tsx          # Simple list of files
│   ├── skeleton.tsx           # Loading skeletons
│   ├── storage-analytics.tsx  # Analytics dashboard
│   ├── success-banner.tsx     # Success message
│   ├── upload-section.tsx     # File upload UI
│   └── index.ts               # Component exports
├── hooks/                # Custom React hooks
│   ├── use-file-handlers.ts   # File operations handlers
│   ├── use-image-urls.ts      # Image URL loading
│   └── use-storage-data.ts    # Data fetching with TanStack Query
├── lib/                  # Utilities and API functions
│   ├── api.ts                 # API client functions
│   └── utils.ts               # Helper functions
└── page.tsx              # Main page component (< 120 lines!)

```

## Architecture

### State Management
- **Zustand** (`@/store/sdk-store.ts`) - Global UI state (upload path, status, etc.)
- **TanStack Query** - Server state, caching, and mutations

### Data Flow
1. `page.tsx` orchestrates everything
2. `useStorageData` hook fetches data using TanStack Query
3. `useFileHandlers` hook manages file operations
4. `useImageUrls` hook loads signed URLs for images
5. Components receive data and callbacks as props

### Components
Each component is:
- **Single Responsibility** - Does one thing well
- **Reusable** - Can be used in other contexts
- **Testable** - Easy to unit test
- **Type-safe** - Full TypeScript support

### Hooks
Custom hooks encapsulate:
- Data fetching logic
- Complex state management
- Side effects (useEffect)
- Event handlers

### API Layer
- Centralized API functions in `lib/api.ts`
- Consistent error handling
- Type-safe responses

## Key Features

✅ **Loading Skeletons** - Smooth loading states
✅ **Optimistic Updates** - Instant UI feedback
✅ **Error Handling** - Graceful error displays
✅ **Caching** - TanStack Query automatic caching
✅ **Type Safety** - Full TypeScript coverage
✅ **Clean Code** - Well-organized and maintainable

## Adding New Features

### Adding a new component:
1. Create in `components/` directory
2. Export from `components/index.ts`
3. Import and use in `page.tsx`

### Adding new API operations:
1. Add function to `lib/api.ts`
2. Add hook to `hooks/` if needed
3. Use in `page.tsx`

### Adding new state:
1. Add to `@/store/sdk-store.ts` for UI state
2. Use TanStack Query for server state
