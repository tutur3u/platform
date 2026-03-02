'use client';

import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys';
import { Calendar, ListTodo } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';

interface MiraInsightsDockProps {
  tasksLabel: string;
  calendarLabel: string;
  tasksContent: React.ReactNode;
  calendarContent: React.ReactNode;
}

type WidgetKey = 'tasks' | 'calendar';
const HOTKEY_TASKS_WIDGET = 'Mod+Alt+T';
const HOTKEY_CALENDAR_WIDGET = 'Mod+Alt+C';

const widgetConfig: Record<
  WidgetKey,
  { icon: React.ComponentType<{ className?: string }> }
> = {
  tasks: { icon: ListTodo },
  calendar: { icon: Calendar },
};

export default function MiraInsightsDock({
  tasksLabel,
  calendarLabel,
  tasksContent,
  calendarContent,
}: MiraInsightsDockProps) {
  const [activeWidget, setActiveWidget] = useState<WidgetKey | null>(null);

  const labels: Record<WidgetKey, string> = {
    tasks: tasksLabel,
    calendar: calendarLabel,
  };

  const contentByWidget: Record<WidgetKey, React.ReactNode> = {
    tasks: tasksContent,
    calendar: calendarContent,
  };

  const hotkeyLabels = useMemo(
    () => ({
      tasks: formatForDisplay(HOTKEY_TASKS_WIDGET),
      calendar: formatForDisplay(HOTKEY_CALENDAR_WIDGET),
    }),
    []
  );

  const toggleWidget = (widget: WidgetKey) => {
    setActiveWidget((prev) => (prev === widget ? null : widget));
  };

  useHotkey(HOTKEY_TASKS_WIDGET, () => {
    toggleWidget('tasks');
  });

  useHotkey(HOTKEY_CALENDAR_WIDGET, () => {
    toggleWidget('calendar');
  });

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/85 p-1 shadow-sm backdrop-blur-md">
        {(Object.keys(widgetConfig) as WidgetKey[]).map((widget) => {
          const Icon = widgetConfig[widget].icon;
          const isActive = activeWidget === widget;

          return (
            <Tooltip key={widget}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleWidget(widget)}
                  aria-label={labels[widget]}
                  className={cn(
                    'h-7 w-7 rounded-md border border-transparent',
                    isActive
                      ? 'border-border/60 bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {`${labels[widget]} (${hotkeyLabels[widget]})`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[17rem] origin-top-right overflow-hidden transition-all duration-200 ease-out',
          activeWidget ? 'max-h-[68vh] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="pointer-events-auto max-h-[68vh] overflow-y-auto rounded-lg border border-border/60 bg-background/95 p-1.5 shadow-lg backdrop-blur-md">
          {activeWidget ? contentByWidget[activeWidget] : null}
        </div>
      </div>
    </div>
  );
}
