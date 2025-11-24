# Mantine Theme Synchronization Guide

## Overview

This application uses Mantine UI components (specifically `@mantine/charts` for visualizations like heatmaps). To ensure visual consistency with the application's design system, Mantine's color scheme **must be kept in sync** with the application's theme variables.

**Mantine is now centralized and available application-wide** through the `MantineThemeProvider` in the root providers.

## Critical Files

1. **Application Theme**: `packages/ui/src/globals.css`
   - Contains the source of truth for all application colors
   - Defines both light and dark mode color variables

2. **Mantine Override**: `apps/web/src/style/mantine-theme-override.css`
   - Maps application colors to Mantine's color system
   - **MUST be updated whenever `globals.css` colors change**
   - Imported globally in root layout

3. **Mantine Provider**: `apps/web/src/components/mantine-theme-provider.tsx`
   - Wraps application with Mantine context
   - Syncs with next-themes for automatic light/dark mode switching
   - Configured to minimize global style pollution

4. **Root Layout**: `apps/web/src/app/[locale]/layout.tsx`
   - Imports Mantine CSS globally
   - Imports theme override CSS
   - Wraps app with providers including MantineThemeProvider

5. **Shared Mantine Styles**: `apps/web/src/style/mantine-heatmap.module.css`
   - Component-specific Mantine styles (e.g., heatmap colors)
   - Can be imported by any component using Mantine charts

## Color Mapping Reference

### Dark Mode Colors

| Application Variable | Value | Mantine Variable | Purpose |
|---------------------|-------|------------------|---------|
| `--root-background` | `hsl(0, 4%, 10%)` | `--mantine-color-body` | Main page background |
| `--background` | `hsl(0 0% 3.9%)` | `--mantine-color-dark-9` | Component backgrounds |
| `--foreground` | `hsl(0 0% 98%)` | `--mantine-color-text` | Primary text color |
| `--secondary` | `hsl(0 0% 14.9%)` | `--mantine-color-default` | Secondary surfaces |
| `--muted-foreground` | `hsl(0 0% 63.9%)` | `--mantine-color-dimmed` | Muted/secondary text |
| `--border` | `hsl(0 0% 14.9%)` | `--mantine-color-border` | Border colors |

### Light Mode Colors

| Application Variable | Value | Mantine Variable | Purpose |
|---------------------|-------|------------------|---------|
| `--background` | `hsl(0 0% 100%)` | `--mantine-color-body` | Main page background |
| `--foreground` | `hsl(0 0% 3.9%)` | `--mantine-color-text` | Primary text color |
| `--muted-foreground` | `hsl(0 0% 45.1%)` | `--mantine-color-dimmed` | Muted/secondary text |
| `--border` | `hsl(0 0% 89.8%)` | `--mantine-color-border` | Border colors |

## Maintenance Workflow

### When Updating Application Colors

**CRITICAL**: If you modify any color variables in `packages/ui/src/globals.css`, you **MUST** update the corresponding Mantine variables in `apps/web/src/style/mantine-theme-override.css`.

#### Step-by-Step Process:

1. **Identify Changed Colors**
   ```css
   /* Example: Changing dark mode background in globals.css */
   .dark {
     --background: hsl(0 0% 5%); /* Changed from 3.9% to 5% */
   }
   ```

2. **Update Mantine Override**
   ```css
   /* Update in apps/web/src/style/mantine-theme-override.css */
   .dark {
     --mantine-color-dark-9: hsl(0 0% 5%) !important; /* Match new value */
   }
   ```

3. **Test Both Themes**
   - Navigate to any page using Mantine components (e.g., `/time-tracker`)
   - Toggle between light and dark mode
   - Verify Mantine components match the application's theme
   - Check multiple pages to ensure consistency

4. **Update This Documentation**
   - Update the color mapping tables above
   - Document any new color variables added
   - Update "Last Synced" date in `mantine-theme-override.css`

### Common Scenarios

#### Adding a New Color Variable

If you add a new semantic color to the application theme:

1. Determine if Mantine components use this color
2. If yes, add a corresponding override in `mantine-theme-override.css`
3. Document the mapping in this file

#### Changing Primary/Accent Colors

Primary and accent colors affect interactive elements:

```css
/* In globals.css */
.dark {
  --primary: hsl(220 80% 60%); /* New primary color */
}

/* Must update in mantine-theme-override.css */
.dark {
  --mantine-color-primary-filled: hsl(220 80% 60%) !important;
  --mantine-color-primary-filled-hover: hsl(220 80% 65%) !important;
}
```

## Using Mantine Components

### In Any Component

Since Mantine is now centralized, you can use Mantine components anywhere in the application:

```tsx
'use client';

import { Heatmap } from '@mantine/charts';
import { Button } from '@mantine/core';
import classes from '@/style/mantine-heatmap.module.css'; // If using heatmap

export function MyComponent() {
  return (
    <div>
      <Button>Mantine Button</Button>
      <Heatmap 
        data={data} 
        classNames={classes}
        // ... other props
      />
    </div>
  );
}
```

**No need to**:
- Import Mantine CSS (already global)
- Wrap with MantineProvider (already at root)
- Create theme configuration (already centralized)

### Adding New Mantine Components

1. Install the Mantine package if needed: `bun add @mantine/<package>`
2. Import and use the component directly
3. Theme will automatically sync with application colors
4. If component needs custom styles, create a module CSS file in `apps/web/src/style/`

## Why This Matters

### Visual Consistency
- Users expect a unified design language throughout the application
- Mismatched colors create a jarring, unprofessional experience
- Brand identity depends on consistent color usage

### Dark Mode Support
- Dark mode is particularly sensitive to color mismatches
- Mantine's default dark colors are significantly different from our theme
- Without overrides, components would have bright white backgrounds in dark mode

### Centralized Management
- Single source of truth for Mantine configuration
- No need to duplicate provider setup across routes
- Easier to maintain and update theme synchronization

## Troubleshooting

### Symptoms of Desynchronized Colors

- ✗ Mantine components have different background color than surrounding UI
- ✗ Tooltip colors don't match application tooltips
- ✗ Text appears too bright or too dim compared to rest of page
- ✗ Borders have different opacity or color

### Diagnostic Steps

1. **Compare Visual Appearance**
   - Open pages with Mantine components in both light and dark mode
   - Compare Mantine areas with surrounding UI elements
   - Look for color discontinuities

2. **Inspect CSS Variables**
   ```javascript
   // In browser console
   const styles = getComputedStyle(document.documentElement);
   console.log('App background:', styles.getPropertyValue('--background'));
   console.log('Mantine body:', styles.getPropertyValue('--mantine-color-body'));
   ```

3. **Check Override Specificity**
   - Ensure `mantine-theme-override.css` is imported in root layout
   - Verify `!important` flags are present on critical overrides
   - Check browser DevTools for which styles are winning

### Quick Fix Checklist

- [ ] `mantine-theme-override.css` is imported in root `layout.tsx`
- [ ] Import order: Mantine CSS → Override CSS
- [ ] All color values match between `globals.css` and override file
- [ ] Both `.dark` and `:root:not(.dark)` selectors are present
- [ ] `!important` flags are used on critical color variables
- [ ] No typos in HSL color values (commas vs spaces)
- [ ] `MantineThemeProvider` is in providers chain

## AI Agent Instructions

**For AI Coding Assistants**: When modifying color-related code in this codebase:

1. **Before changing colors in `packages/ui/src/globals.css`**:
   - Note which variables are being changed
   - Check if they're used in `apps/web/src/style/mantine-theme-override.css`

2. **After changing colors**:
   - Update corresponding Mantine variables in `mantine-theme-override.css`
   - Maintain the same HSL format and syntax
   - Keep `!important` flags on overrides
   - Update "Last Synced" date in the file

3. **When using Mantine components**:
   - Import components directly (no provider setup needed)
   - Use shared styles from `apps/web/src/style/` when available
   - Create new module CSS files in `apps/web/src/style/` for component-specific styles
   - Never create route-specific Mantine providers or theme configs

4. **Testing Requirements**:
   - Always test both light and dark modes
   - Test across multiple pages using Mantine components
   - Compare Mantine components visually with native app components

## Migration Notes

**Previous Architecture** (before centralization):
- Mantine CSS imported in route-specific layouts
- MantineProvider wrapped individual routes
- Theme override CSS in route directories
- Duplicate configuration across routes

**Current Architecture** (centralized):
- Mantine CSS imported in root layout (global)
- MantineThemeProvider at root level in providers
- Single theme override CSS in `apps/web/src/style/`
- Shared configuration, no duplication

**Benefits**:
- ✓ Consistent theming across all pages
- ✓ No need to set up Mantine per-route
- ✓ Easier maintenance (single source of truth)
- ✓ Better performance (CSS loaded once)
- ✓ Simpler component usage

## Related Documentation

- [Tailwind Dynamic Color Policy](../../AGENTS.md#511-tailwind-dynamic-color-policy)
- [Third-Party UI Library Integration](../../AGENTS.md#520-third-party-ui-library-integration--theme-synchronization)
- [Application Theme System](../../packages/ui/src/globals.css)
- [Mantine Documentation](https://mantine.dev/theming/colors/)

## Version History

| Date | Change | Updated By |
|------|--------|------------|
| 2024-11-24 | Initial documentation created | AI Agent |
| 2024-11-24 | Added dark mode color mappings | AI Agent |
| 2024-11-24 | Documented root-background sync | User |
| 2024-11-24 | Centralized Mantine configuration | AI Agent |
| 2024-11-24 | Moved to global docs directory | AI Agent |

---

**Remember**: Color consistency is not optional. Always update Mantine overrides when changing application theme colors.

