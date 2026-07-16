// Thin barrel — panels were split into focused modules to stay well under the
// 700-LOC ceiling. Import paths remain stable for existing consumers.
export { GoalsPanel } from './task-progress-goals-panel';
export { ProgressPanel } from './task-progress-progress-panel';
export {
  formatNumber,
  InsightCard,
  MetricSelect,
  SummaryCard,
  today,
} from './task-progress-shared';
export { StatsPanel } from './task-progress-stats-panel';
