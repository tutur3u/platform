'use client';

import {
  BarChart3,
  Calendar,
  CheckCircle2,
  MessageSquare,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

const apps = [
  {
    icon: CheckCircle2,
    name: 'Tasks',
    color: 'green',
    items: ['Design review', 'API integration', 'User testing'],
  },
  {
    icon: Calendar,
    name: 'Calendar',
    color: 'blue',
    items: ['Team standup', 'Client call', 'Sprint planning'],
  },
  {
    icon: MessageSquare,
    name: 'Chat',
    color: 'purple',
    items: ['Project updates', 'Quick sync', 'Feedback'],
  },
  {
    icon: BarChart3,
    name: 'Analytics',
    color: 'cyan',
    items: ['87% productivity', '24 tasks done', '18.5h focused'],
  },
];

export function ProductPreview() {
  return (
    <div className="relative mx-auto mb-8 max-w-4xl">
      {/* Browser Frame */}
      <div className="overflow-hidden rounded-xl border border-foreground/10 bg-background/80 shadow-2xl backdrop-blur-sm">
        {/* Browser Header */}
        <div className="flex items-center gap-2 border-foreground/5 border-b bg-foreground/[0.02] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-foreground/10" />
            <div className="h-3 w-3 rounded-full bg-foreground/10" />
            <div className="h-3 w-3 rounded-full bg-foreground/10" />
          </div>
          <div className="mx-auto max-w-md flex-1">
            <div className="h-6 rounded-md bg-foreground/5 px-3 text-center font-mono text-foreground/40 text-xs leading-6">
              tuturuuu.com/dashboard
            </div>
          </div>
        </div>

        {/* App Preview Grid */}
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {apps.map((app, index) => (
            <motion.div
              key={app.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
              className={cn(
                'group rounded-lg border p-3 transition-all hover:shadow-md',
                `bg-dynamic-${app.color}/5 border-dynamic-${app.color}/20 hover:border-dynamic-${app.color}/30`
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md',
                    `bg-dynamic-${app.color}/10`
                  )}
                >
                  <app.icon
                    className={cn('h-4 w-4', `text-dynamic-${app.color}`)}
                  />
                </div>
                <span className="font-medium text-sm">{app.name}</span>
              </div>
              <div className="space-y-1">
                {app.items.map((item, i) => (
                  <div
                    key={i}
                    className="truncate rounded bg-background/50 px-2 py-1 text-foreground/60 text-xs"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Subtle Glow Effect */}
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-2xl bg-gradient-to-b from-foreground/5 via-transparent to-transparent opacity-50 blur-xl" />
    </div>
  );
}
