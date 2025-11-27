// Components
export { ClickableTaskItem, SubtaskActionButtons, TabButton } from './components';

// Section components
export { DependenciesSection } from './dependencies-section';
export { ParentSection } from './parent-section';
export { RelatedSection } from './related-section';
export { SubtasksSection } from './subtasks-section';

// Search popover
export { TaskSearchPopover, TaskSearchPopoverContent } from './task-search-popover';

// Types
export type {
  ClickableTaskItemProps,
  DependenciesSectionProps,
  DependencySubTab,
  ParentSectionProps,
  RelatedSectionProps,
  RelationshipTab,
  SubtaskActionButtonsProps,
  SubtasksSectionProps,
  TabButtonProps,
  TabColorVariant,
  TaskRelationshipsPropertiesProps,
  TaskSearchPopoverContentProps,
  TaskSearchPopoverProps,
} from './types/task-relationships.types';
