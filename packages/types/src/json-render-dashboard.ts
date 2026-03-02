import type { ReactNode } from 'react';
import type { TimeTrackingPeriodStats, Workspace } from './db';
import type { Tables } from './supabase';

export type JsonRenderBindings = Partial<Record<string, string>>;

export type JsonRenderComponentContext<
  TProps,
  TBindings extends JsonRenderBindings = JsonRenderBindings,
  TChildren extends ReactNode | ((...args: never[]) => ReactNode) = ReactNode,
> = {
  props: TProps;
  children?: TChildren;
  bindings?: TBindings;
};

export type JsonRenderOption = {
  label: string;
  value: string;
};

export type JsonRenderCardProps = {
  title?: string;
  description?: string | null;
};

export type JsonRenderStackProps = {
  direction?: 'vertical' | 'horizontal';
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
};

export type JsonRenderGridProps = {
  cols?: number;
  gap?: number;
};

export type JsonRenderTextProps = {
  content?: string;
  text?: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'small' | 'tiny';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'error';
  align?: 'left' | 'center' | 'right';
};

export type JsonRenderIconProps = {
  name: string;
  size?: number;
  color?: string;
};

export type JsonRenderBadgeProps = {
  label: string;
  variant?:
    | 'default'
    | 'secondary'
    | 'outline'
    | 'success'
    | 'warning'
    | 'error';
};

export type JsonRenderAvatarProps = {
  src?: string;
  fallback?: string;
  size?: number;
};

export type JsonRenderSeparatorProps = {
  orientation?: 'horizontal' | 'vertical';
};

export type JsonRenderCalloutProps = {
  content?: string;
  text?: string;
  title?: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
};

export type JsonRenderListItemProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  trailing?: string;
  action?: string;
};

export type JsonRenderProgressProps = {
  value: number;
  label?: string;
  showValue?: boolean;
  color?: 'default' | 'success' | 'warning' | 'error';
};

export type JsonRenderMetricProps = {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
};

export type JsonRenderTab = {
  id: string;
  label: string;
  content?: string;
};

export type JsonRenderTabsProps = {
  tabs: JsonRenderTab[];
  defaultTab?: string;
};

export type JsonRenderButtonProps = {
  label: string;
  variant?:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'ghost'
    | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  icon?: string;
  action?: string;
};

export type JsonRenderBarChartDatum = {
  label: string;
  value: number;
  color?: string;
};

export type JsonRenderBarChartProps = {
  data: JsonRenderBarChartDatum[];
  height?: number;
};

export type JsonRenderArticleHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  byline?: string;
  publishedAt?: string;
  readingTime?: string;
};

export type JsonRenderInsightSectionProps = {
  title: string;
  summary?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
};

export type JsonRenderKeyPointsProps = {
  title?: string;
  points: string[];
  ordered?: boolean;
};

export type JsonRenderSourceListItem = {
  title: string;
  url: string;
  publisher?: string;
  note?: string;
};

export type JsonRenderSourceListProps = {
  title?: string;
  sources: JsonRenderSourceListItem[];
  compact?: boolean;
  showUrl?: boolean;
};

export type JsonRenderFlashcardProps = {
  front: string;
  back: string;
  randomize?: boolean;
};

export type JsonRenderQuizProps = {
  question: string;
  options: string[];
  answer?: string;
  correctAnswer?: string;
  explanation?: string;
  randomize?: boolean;
};

export type JsonRenderMultiQuizItem = {
  question?: string;
  options?: string[];
  answer?: string;
  correctAnswer?: string;
  explanation?: string;
  randomizeOptions?: boolean;
};

export type JsonRenderMultiQuizProps = {
  title?: string;
  description?: string;
  quizzes?: JsonRenderMultiQuizItem[];
  randomize?: boolean;
};

export type JsonRenderMultiFlashcardItem = {
  front: string;
  back: string;
};

export type JsonRenderMultiFlashcardProps = {
  title?: string;
  description?: string;
  flashcards?: JsonRenderMultiFlashcardItem[];
  randomize?: boolean;
};

export type JsonRenderFormProps = {
  title: string;
  description?: string;
  submitLabel?: string;
  submitAction?: string;
  submitParams?: Record<string, unknown>;
  onSubmit?: string;
};

export type JsonRenderInputProps = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'email' | 'password' | 'datetime-local';
  value?: string | number;
};

export type JsonRenderFileAttachmentInputProps = {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  maxFiles?: number;
  accept?: string;
  value?: File[];
};

export type JsonRenderTextareaProps = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  multiline?: boolean;
  value?: string;
};

export type JsonRenderCheckboxProps = {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  checked?: boolean;
};

export type JsonRenderCheckboxGroupProps = {
  name: string;
  label: string;
  options: JsonRenderOption[];
  required?: boolean;
  values?: string[];
};

export type JsonRenderRadioGroupProps = {
  name: string;
  label: string;
  options: JsonRenderOption[];
  required?: boolean;
  value?: string;
};

export type JsonRenderSelectProps = {
  name: string;
  label: string;
  placeholder?: string;
  options: JsonRenderOption[];
  required?: boolean;
  value?: string;
};

export type JsonRenderMyTasksProps = {
  showSummary?: boolean;
  showFilters?: boolean;
};

export type JsonRenderTimeTrackingStatsProps = {
  period?:
    | 'today'
    | 'this_week'
    | 'this_month'
    | 'last_7_days'
    | 'last_30_days'
    | 'custom';
  dateFrom?: string;
  dateTo?: string;
  showBreakdown?: boolean;
  showDailyBreakdown?: boolean;
  maxItems?: number;
};

export type JsonRenderWorkspaceSummary = Pick<Workspace, 'id' | 'personal'>;

export type JsonRenderTransactionCategory = Pick<
  Tables<'transaction_categories'>,
  'id' | 'is_expense'
>;

export type JsonRenderTimeTrackingStatsResponse = TimeTrackingPeriodStats;
