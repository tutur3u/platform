import {
  Calendar,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  FileText,
  Flag,
  ListChecks,
  MessageSquare,
  Star,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import type { FormQuestionInput } from './schema';
import type { FormDefinitionQuestion } from './types';

type QuestionType = FormQuestionInput['type'] | FormDefinitionQuestion['type'];
type IconComponent = ComponentType<{ className?: string }>;

const QUESTION_TYPE_ICONS: Record<QuestionType, IconComponent> = {
  short_text: FileText,
  long_text: MessageSquare,
  single_choice: CircleCheckBig,
  multiple_choice: ListChecks,
  dropdown: ClipboardList,
  linear_scale: Flag,
  rating: Star,
  date: Calendar,
  time: Clock3,
  section_break: ClipboardList,
};

export function QuestionTypeIcon({
  type,
  className,
}: {
  type: QuestionType;
  className?: string;
}) {
  const Icon = QUESTION_TYPE_ICONS[type];

  return <Icon className={cn('h-4 w-4', className)} />;
}

export function FieldLabel({
  icon: Icon,
  children,
  className,
}: {
  icon: IconComponent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 pb-1', className)}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="leading-none">{children}</span>
    </span>
  );
}
