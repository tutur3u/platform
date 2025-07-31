'use client';

import { templateScenarios } from '@tuturuuu/ai/scheduling/templates';
import type { TemplateScenario } from '@tuturuuu/ai/scheduling/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  BookOpenIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ClockIcon,
  FlagIcon,
  HeartIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
  ZapIcon,
} from '@tuturuuu/ui/icons';

interface TemplateScenarioProps {
  onLoadTemplate: (template: TemplateScenario) => void;
  onClearAll: () => void;
}

const getTemplateIcon = (name: string) => {
  if (name.includes('Work')) return BriefcaseIcon;
  if (name.includes('Split')) return ZapIcon;
  if (name.includes('Mixed')) return CalendarDaysIcon;
  if (name.includes('Deadline')) return FlagIcon;
  if (name.includes('Overload')) return TrendingUpIcon;
  if (name.includes('Flexible')) return SparklesIcon;
  if (name.includes('Meeting')) return UsersIcon;
  if (name.includes('Personal')) return HeartIcon;
  if (name.includes('Study')) return BookOpenIcon;
  return ClockIcon;
};

const getCategoryColor = (category: 'work' | 'personal' | 'meeting') => {
  switch (category) {
    case 'work':
      return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30';
    case 'personal':
      return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30';
    case 'meeting':
      return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/30';
    default:
      return 'bg-dynamic-gray/10 text-dynamic-gray border-dynamic-gray/30';
  }
};

export function TemplateScenarios({
  onLoadTemplate,
  onClearAll,
}: TemplateScenarioProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayIcon className="h-5 w-5" />
          Quick Templates
        </CardTitle>
        <CardDescription>
          Load predefined scenarios to test different aspects of the scheduling
          algorithm
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-96 space-y-3 overflow-y-auto">
        {templateScenarios.map((template) => {
          const IconComponent = getTemplateIcon(template.name);
          const categories = [
            ...new Set(template.tasks.map((task) => task.category)),
          ];

          return (
            <div
              key={template.name}
              className="group rounded-lg border p-4 transition-colors hover:bg-accent/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium">{template.name}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {template.tasks.length} tasks
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {template.tasks.reduce(
                        (sum, task) => sum + task.duration,
                        0
                      )}
                      h total
                    </Badge>
                    {categories.map((category) => (
                      <Badge
                        key={category}
                        className={`text-xs ${getCategoryColor(category)}`}
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onLoadTemplate(template)}
                  className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                >
                  Load
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
      <div className="p-6 pt-0">
        <Button
          variant="outline"
          onClick={onClearAll}
          className="w-full"
          size="sm"
        >
          <RotateCcwIcon className="mr-2 h-4 w-4" />
          Clear All Tasks
        </Button>
      </div>
    </Card>
  );
}
