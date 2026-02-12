/**
 * Session History Component
 *
 * This file re-exports from the modular session-history folder.
 * The component has been refactored into smaller, more maintainable modules:
 *
 * - session-history.tsx: Main component
 * - stacked-session-item.tsx: Individual session item display
 * - session-filters.tsx: Search and filter controls
 * - period-navigation.tsx: Day/week/month navigation
 * - session-stats.tsx: Period statistics summary
 * - month-view.tsx: Month view layout
 * - edit-session-dialog.tsx: Edit session dialog
 * - use-session-actions.ts: Session action handlers hook
 * - session-types.ts: TypeScript types
 * - session-utils.ts: Utility functions
 */

// Re-export everything from the modular folder
export * from './session-history/index';

// Default export for backward compatibility
export { SessionHistory as default } from './session-history/index';
