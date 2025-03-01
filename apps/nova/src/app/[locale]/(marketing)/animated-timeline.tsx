import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface TimelineEvent {
  date: string;
  title: string;
  type: 'Virtual' | 'On-site';
  icon: ReactNode;
  description: string;
}

interface AnimatedTimelineProps {
  events: TimelineEvent[];
}

export default function AnimatedTimeline({ events }: AnimatedTimelineProps) {
  return (
    <div className="relative mt-12">
      {/* Timeline line */}
      <div className="absolute left-1/2 hidden h-full w-0.5 -translate-x-1/2 bg-primary/20 md:block" />

      <div className="space-y-12">
        {events.map((event, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.2 }}
            className={`flex flex-col items-center gap-8 ${
              index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
            }`}
          >
            {/* Content Card */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="relative w-full md:w-[calc(50%-2rem)]"
            >
              <Card className="overflow-hidden border-foreground/10 bg-foreground/5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {event.date}
                    </p>
                    <h3 className="mb-2 text-lg font-bold">{event.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {event.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                    {event.type}
                  </span>
                </div>
              </Card>
            </motion.div>

            {/* Timeline Node */}
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 + 0.1 }}
              className="relative hidden h-12 w-12 items-center justify-center rounded-full border-4 bg-foreground md:flex"
            >
              <div className="text-background">{event.icon}</div>
            </motion.div>

            {/* Spacer for alternating layout */}
            <div className="hidden w-[calc(50%-2rem)] md:block" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
