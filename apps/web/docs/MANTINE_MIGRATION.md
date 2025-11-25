# Mantine UI Centralization Migration

## Overview

This document describes the migration of Mantine UI integration from route-scoped to application-wide centralized configuration.

## What Changed

### Before (Route-Scoped)

```
apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/
├── layout.tsx                          # Imported Mantine CSS
├── mantine-theme-override.css          # Route-specific overrides
├── MANTINE_THEME_SYNC.md               # Route-specific docs
└── components/
    ├── activity-heatmap.tsx            # Created MantineProvider wrapper
    └── activity-heatmap.module.css     # Component-specific styles
```

**Issues**:
- Duplicate configuration if used in multiple routes
- Manual provider setup in each component
- CSS imports scattered across routes
- Difficult to maintain consistency

### After (Centralized)

```
apps/web/
├── src/
│   ├── components/
│   │   ├── providers.tsx               # Includes MantineThemeProvider
│   │   └── mantine-theme-provider.tsx  # NEW: Centralized provider
│   ├── style/
│   │   ├── mantine-theme-override.css  # MOVED: Global overrides
│   │   └── mantine-heatmap.module.css  # MOVED: Shared component styles
│   └── app/[locale]/
│       └── layout.tsx                  # Imports Mantine CSS globally
└── docs/
    └── MANTINE_THEME_SYNC.md           # MOVED: Centralized documentation
```

**Benefits**:
- ✓ Single source of truth for Mantine configuration
- ✓ No provider setup needed in components
- ✓ Consistent theming across all pages
- ✓ Easier maintenance and updates
- ✓ Better performance (CSS loaded once)

## Migration Steps Completed

### 1. Created Centralized Provider

**File**: `apps/web/src/components/mantine-theme-provider.tsx`

```typescript
'use client';

import { createTheme, MantineProvider } from '@mantine/core';
import { useTheme } from 'next-themes';

const mantineTheme = createTheme({
  fontFamily: 'inherit',
  defaultRadius: 'md',
});

export function MantineThemeProvider({ children }) {
  const { resolvedTheme } = useTheme();

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      withCssVariables={false}
      withGlobalClasses={false}
      withStaticClasses={false}
    >
      {children}
    </MantineProvider>
  );
}
```

**Key Features**:
- Integrates with next-themes for automatic light/dark mode
- Minimizes global style pollution
- Inherits application font family

### 2. Updated Root Providers

**File**: `apps/web/src/components/providers.tsx`

Added `MantineThemeProvider` to the provider chain:

```typescript
<ThemeProvider {...}>
  <MantineThemeProvider>
    <ClientProviders>{children}</ClientProviders>
  </MantineThemeProvider>
</ThemeProvider>
```

### 3. Moved CSS to Root Layout

**File**: `apps/web/src/app/[locale]/layout.tsx`

Added global imports:

```typescript
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@/style/mantine-theme-override.css';
```

### 4. Centralized Theme Overrides

**Moved**: `time-tracker/mantine-theme-override.css` → `apps/web/src/style/mantine-theme-override.css`

This file maps application colors to Mantine's color system and is now loaded globally.

### 5. Shared Component Styles

**Moved**: `time-tracker/components/activity-heatmap.module.css` → `apps/web/src/style/mantine-heatmap.module.css`

Component-specific styles are now in a shared location and can be imported by any component:

```typescript
import classes from '@/style/mantine-heatmap.module.css';
```

### 6. Updated Components

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/components/activity-heatmap.tsx`

**Removed**:
- `createTheme` and `mantineTheme` configuration
- `MantineProvider` wrapper
- Inline scoped CSS variables
- `useTheme` hook (no longer needed in component)

**Changed**:
```typescript
// Before
import { createTheme, MantineProvider } from '@mantine/core';
import { useTheme } from 'next-themes';
import classes from './activity-heatmap.module.css';

// After
import classes from '@/style/mantine-heatmap.module.css';
```

### 7. Cleaned Up Route Layout

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/layout.tsx`

**Removed**:
```typescript
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import './mantine-theme-override.css';
```

Now just a simple layout wrapper with no Mantine-specific imports.

### 8. Updated Documentation

**Moved**: `time-tracker/MANTINE_THEME_SYNC.md` → `apps/web/docs/MANTINE_THEME_SYNC.md`

Updated documentation to reflect centralized architecture and usage patterns.

**Updated**: `AGENTS.md` section 5.20 to document centralized Mantine integration pattern.

### 9. Deleted Old Files

Removed route-specific files:
- `time-tracker/mantine-theme-override.css`
- `time-tracker/components/activity-heatmap.module.css`
- `time-tracker/MANTINE_THEME_SYNC.md`

## Usage After Migration

### Using Mantine Components

```typescript
'use client';

import { Heatmap } from '@mantine/charts';
import { Button, Modal } from '@mantine/core';
import classes from '@/style/mantine-heatmap.module.css'; // If needed

export function MyComponent() {
  return (
    <div>
      <Button>Click Me</Button>
      <Heatmap data={data} classNames={classes} />
    </div>
  );
}
```

**No need to**:
- Import Mantine CSS
- Wrap with MantineProvider
- Create theme configuration
- Set up color scheme sync

### Adding New Mantine Components

1. Install package: `bun add @mantine/<package>`
2. Import and use directly in any component
3. Theme automatically syncs with application colors

### Creating Component-Specific Styles

1. Create module CSS in `apps/web/src/style/mantine-<component>.module.css`
2. Import in component: `import classes from '@/style/mantine-<component>.module.css'`
3. Use with `classNames` prop: `<Component classNames={classes} />`

## Maintenance

### Updating Application Colors

When changing colors in `packages/ui/src/globals.css`:

1. Update corresponding variables in `apps/web/src/style/mantine-theme-override.css`
2. Test both light and dark modes
3. Update "Last Synced" date in override file
4. See `apps/web/docs/MANTINE_THEME_SYNC.md` for detailed mapping

### Adding New Routes with Mantine

No special setup needed! Just import and use Mantine components directly.

## Testing Checklist

After migration, verify:

- [ ] Time tracker heatmap displays correctly
- [ ] Light/dark mode switching works
- [ ] Colors match surrounding UI
- [ ] No console errors related to Mantine
- [ ] No visual discontinuities
- [ ] Tooltips match application theme
- [ ] Navigation between routes doesn't cause style leaks

## Rollback Plan

If issues arise, the old route-scoped implementation can be restored from git history:

```bash
git checkout <commit-before-migration> -- apps/web/src/app/[locale]/(dashboard)/[wsId]/time-tracker/
```

However, this is not recommended as centralized configuration is the preferred pattern.

## Future Considerations

### Other Routes Using Mantine

If other routes start using Mantine components, they can immediately benefit from the centralized configuration without any setup.

### Other Third-Party UI Libraries

Consider centralizing other UI libraries (Radix, Material-UI, etc.) following the same pattern if they're used across multiple routes.

### Performance Optimization

If Mantine CSS becomes too large, consider:
- Code splitting specific Mantine packages
- Tree-shaking unused components
- Lazy loading heavy chart components

## References

- [Mantine Theme Sync Documentation](./MANTINE_THEME_SYNC.md)
- [AGENTS.md Section 5.20](../../AGENTS.md#520-third-party-ui-library-integration--theme-synchronization)
- [Mantine Official Documentation](https://mantine.dev/)

## Migration Date

**Completed**: 2024-11-24
**Migrated By**: AI Agent
**Approved By**: User

