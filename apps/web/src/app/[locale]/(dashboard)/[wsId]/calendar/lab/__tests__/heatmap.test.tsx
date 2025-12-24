import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeatmapOverlay } from '../components/heatmap-overlay';

// Mock dayjs to avoid timezone issues in tests
vi.mock('dayjs', () => {
  const actual = vi.importActual('dayjs');
  return {
    ...actual,
    default: vi.fn(() => ({
      hour: vi.fn(() => ({
        minute: vi.fn(() => ({
          toDate: vi.fn(() => new Date()),
        })),
      })),
      add: vi.fn(() => ({
        toDate: vi.fn(() => new Date()),
      })),
    })),
  };
});

// Mock @tuturuuu/ai scoring functions
vi.mock('@tuturuuu/ai/scheduling/duration-optimizer', () => ({
  scoreSlotForHabit: vi.fn(() => 1000),
  scoreSlotForTask: vi.fn(() => 500),
}));

describe('HeatmapOverlay', () => {
  const mockScenario = {
    habits: [{ id: 'h1', name: 'Habit 1', duration_minutes: 30 }],
    tasks: [{ id: 't1', name: 'Task 1', priority: 'normal' }],
    events: [],
    settings: { timezone: 'UTC' },
  };

  it('should render heatmap for a habit', () => {
    const { container } = render(
      <HeatmapOverlay
        scenario={mockScenario as any}
        selectedItemId="h1"
        dates={[new Date()]}
      />
    );
    expect(container.firstChild).toBeDefined();
  });

  it('should render heatmap for a task', () => {
    const { container } = render(
      <HeatmapOverlay
        scenario={mockScenario as any}
        selectedItemId="t1"
        dates={[new Date()]}
      />
    );
    expect(container.firstChild).toBeDefined();
  });

  it('should render heatmap with custom weights', () => {
    const { container } = render(
      <HeatmapOverlay
        scenario={mockScenario as any}
        selectedItemId="h1"
        dates={[new Date()]}
        weights={{ habitIdealTimeBonus: 2000 }}
      />
    );
    expect(container.firstChild).toBeDefined();
  });

  it('should return null if item not found', () => {
    const { container } = render(
      <HeatmapOverlay
        scenario={mockScenario as any}
        selectedItemId="non-existent"
        dates={[new Date()]}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
