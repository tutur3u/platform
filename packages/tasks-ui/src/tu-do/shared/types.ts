/**
 * Centralized type re-exports for tu-do shared components
 *
 * This file consolidates type definitions to reduce coupling via deep relative imports.
 * All exports are type-only to prevent accidental runtime dependencies.
 */

export type {
  SortOption,
  TaskAssignee,
  TaskFilters,
  TaskLabel,
  TaskProject,
} from './task-filter.types';
