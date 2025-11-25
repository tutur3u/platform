# Time Tracker Route

Activity tracking and time management features with visual heatmap analytics.

## Key Features

- **Activity Heatmap**: GitHub-style contribution heatmap using Mantine Charts
- **Session History**: Detailed time tracking records
- **Category Management**: Organize activities by category
- **Goal Tracking**: Set and monitor time-based goals
- **Statistics Dashboard**: Comprehensive analytics and insights

## Third-Party Dependencies

This route uses **Mantine UI** (`@mantine/core` and `@mantine/charts`) for the activity heatmap visualization.

### ⚠️ Important: Theme Synchronization Required

Mantine has its own theming system that **must be kept in sync** with the application's design system to maintain visual consistency.

**Key Files:**

- `layout.tsx` - Route-scoped CSS imports (Mantine CSS loaded here)
- `mantine-theme-override.css` - Color mappings from app theme to Mantine
- `MANTINE_THEME_SYNC.md` - **Complete documentation** (READ THIS FIRST)

### For Developers & AI Agents

**CRITICAL**: When updating colors in `packages/ui/src/globals.css`:

1. ✅ Update `mantine-theme-override.css` with new color values
2. ✅ Test both light and dark modes
3. ✅ Update documentation in `MANTINE_THEME_SYNC.md`
4. ✅ Verify no style leakage by navigating to/from the route

See [MANTINE_THEME_SYNC.md](./MANTINE_THEME_SYNC.md) for detailed instructions.

## Architecture Notes

### Route-Scoped CSS Loading

Mantine CSS is imported in `layout.tsx` (not in components) to ensure:
- Styles only load when visiting time-tracker routes
- No global style pollution to other parts of the application
- Proper cleanup when navigating away

### Component Structure

```
time-tracker/
├── layout.tsx                      # Route layout with Mantine CSS imports
├── page.tsx                        # Main time tracker page
├── mantine-theme-override.css     # Theme synchronization (KEEP IN SYNC!)
├── MANTINE_THEME_SYNC.md          # Complete documentation
├── README.md                       # This file
└── components/
    ├── activity-heatmap.tsx        # Main heatmap component (uses Mantine)
    ├── activity-heatmap.module.css # Heatmap-specific styles
    ├── session-history.tsx         # Session records table
    ├── category-manager.tsx        # Category CRUD
    ├── goal-manager.tsx            # Goal tracking
    └── ...
```

## Development

### Running Locally

```bash
# Start dev server
bun dev

# Navigate to time tracker
# http://localhost:3000/[wsId]/time-tracker
```

### Testing Theme Changes

1. Modify colors in `packages/ui/src/globals.css`
2. Update `mantine-theme-override.css` accordingly
3. Test in browser:
   - Toggle light/dark mode
   - Check heatmap colors match surrounding UI
   - Navigate to another route and back
   - Verify no style persistence issues

### Common Issues

**Problem**: Heatmap colors don't match app theme
- **Solution**: Check `mantine-theme-override.css` is up to date

**Problem**: Styles persist after navigating away
- **Solution**: Ensure Mantine CSS is imported in `layout.tsx`, not components

**Problem**: Dark mode looks wrong
- **Solution**: Verify all `--mantine-color-*` variables are mapped in override file

## Related Documentation

- [AGENTS.md § 5.20 - Third-Party UI Library Integration](../../../../../../../../../AGENTS.md#520-third-party-ui-library-integration--theme-synchronization)
- [Application Theme System](../../../../../../../../../packages/ui/src/globals.css)
- [Mantine Charts Documentation](https://mantine.dev/charts/getting-started/)

## Maintenance

This route requires **active maintenance** when:
- Application theme colors change
- Mantine library is upgraded
- New Mantine components are added

Always refer to `MANTINE_THEME_SYNC.md` for the maintenance workflow.

