# Tasks Directory Performance Optimization Guide

## Overview
This document outlines the major performance issues found in the tasks directory and provides solutions for fixing them.

## Critical Performance Issues Identified

### 1. GanttChart.tsx - Fixed ✅
**Issues:**
- Missing dependencies in useEffect hooks
- Non-memoized callback functions causing unnecessary re-renders
- Inefficient time range calculations

**Fixes Applied:**
- Added `useCallback` for `handleCloseClick` and `handleTaskClick`
- Memoized `getTimeRange` function with `useCallback`
- Added proper dependency tracking with `useRef` for filter changes
- Memoized expensive calculations with `useMemo`

### 2. Enhanced Boards View - Partially Fixed ⚠️
**Issues:**
- Large component (1600+ lines) with complex logic
- Non-memoized callback functions
- Inefficient filtering operations
- Accessibility issues with interactive divs

**Fixes Applied:**
- Added `useCallback` for all event handlers
- Optimized filtering with early returns
- Memoized expensive computations
- Started converting interactive divs to buttons (incomplete)

**Remaining Issues:**
- Accessibility violations (interactive divs need keyboard handlers)
- Form label associations missing
- Component still too large and should be split

### 3. Analytics Hooks - Needs Review
**File:** `hooks/useTaskAnalytics.ts`
**Issues:**
- Heavy computations in useMemo hooks
- Potential for unnecessary recalculations
- No memoization of intermediate results

### 4. Task Helpers - Needs Optimization
**File:** `utils/taskHelpers.ts`
**Issues:**
- Date calculations performed repeatedly
- No caching of expensive operations
- Inefficient filtering logic

## Performance Optimization Recommendations

### 1. Component Splitting
Split large components into smaller, focused components:

```typescript
// Split enhanced-boards-view.tsx into:
- QuickStats.tsx
- BoardGrid.tsx
- AnalyticsTabs.tsx
- TaskModal.tsx
- FilterControls.tsx
```

### 2. Memoization Strategy
Implement proper memoization for expensive operations:

```typescript
// Use React.memo for components that receive stable props
const QuickStats = React.memo(({ stats }) => {
  // Component logic
});

// Use useMemo for expensive calculations
const expensiveCalculation = useMemo(() => {
  // Heavy computation
}, [dependencies]);

// Use useCallback for event handlers
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);
```

### 3. Data Structure Optimization
Optimize data structures for better performance:

```typescript
// Use Map/Set for O(1) lookups instead of Array.find()
const taskMap = useMemo(() => {
  return new Map(tasks.map(task => [task.id, task]));
}, [tasks]);

// Use Set for unique value checks
const uniqueStatuses = useMemo(() => {
  return new Set(tasks.map(task => task.status));
}, [tasks]);
```

### 4. Virtualization for Large Lists
Implement virtualization for large task lists:

```typescript
import { FixedSizeList as List } from 'react-window';

const VirtualizedTaskList = ({ tasks }) => {
  return (
    <List
      height={400}
      itemCount={tasks.length}
      itemSize={50}
      itemData={tasks}
    >
      {TaskRow}
    </List>
  );
};
```

### 5. Debouncing and Throttling
Implement debouncing for search and filtering:

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback(
  (query: string) => {
    setSearchQuery(query);
  },
  300
);
```

## Accessibility Fixes Needed

### 1. Interactive Elements
Convert all interactive divs to proper button elements:

```typescript
// Before
<div onClick={handleClick} className="cursor-pointer">
  Content
</div>

// After
<button
  type="button"
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  className="cursor-pointer"
>
  Content
</button>
```

### 2. Form Labels
Associate labels with form inputs:

```typescript
// Before
<label>Search</label>
<input type="text" />

// After
<label htmlFor="search-input">Search</label>
<input id="search-input" type="text" />
```

## Implementation Priority

### High Priority (Critical Performance)
1. ✅ Fix GanttChart useEffect dependencies
2. ⚠️ Complete accessibility fixes in enhanced-boards-view
3. 🔄 Split large components into smaller ones
4. 🔄 Implement virtualization for large lists

### Medium Priority (Performance Improvements)
1. 🔄 Optimize analytics hooks
2. 🔄 Add debouncing to search/filter operations
3. 🔄 Implement proper memoization strategy
4. 🔄 Optimize data structures

### Low Priority (Code Quality)
1. 🔄 Add comprehensive error boundaries
2. 🔄 Implement proper loading states
3. 🔄 Add performance monitoring
4. 🔄 Optimize bundle size

## Testing Performance Improvements

### 1. React DevTools Profiler
Use React DevTools to identify unnecessary re-renders:

```typescript
import { Profiler } from 'react';

<Profiler id="GanttChart" onRender={onRenderCallback}>
  <GanttChart {...props} />
</Profiler>
```

### 2. Performance Monitoring
Add performance monitoring:

```typescript
const onRenderCallback = (
  id: string,
  phase: string,
  actualDuration: number
) => {
  if (actualDuration > 16) {
    console.warn(`${id} took ${actualDuration}ms to render`);
  }
};
```

### 3. Bundle Analysis
Use bundle analyzers to identify large dependencies:

```bash
npm install --save-dev @next/bundle-analyzer
```

## Conclusion

The main performance bottlenecks have been identified and partially addressed. The most critical fixes (GanttChart useEffect dependencies) have been completed. The remaining work focuses on:

1. Completing accessibility fixes
2. Splitting large components
3. Implementing proper memoization strategies
4. Adding virtualization for large datasets

These optimizations will significantly improve the performance and user experience of the tasks module. 