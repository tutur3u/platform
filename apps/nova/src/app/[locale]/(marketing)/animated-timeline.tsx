import { cn } from '@tuturuuu/utils/format';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  type: 'Virtual' | 'On-site';
  icon: React.ReactNode;
}

interface AnimatedTimelineProps {
  events: TimelineEvent[];
}

export default function AnimatedTimeline({ events }: AnimatedTimelineProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <div ref={ref} className="relative py-8">
      {/* Connecting Line */}
      <motion.div
        className="absolute top-0 left-4 h-full w-px bg-primary/20 md:left-1/2"
        initial={{ scaleY: 0 }}
        animate={isInView ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 1 }}
      />

      {/* Timeline Events */}
      <div className="relative space-y-8">
        {events.map((event, index) => (
          <motion.div
            key={event.title}
            className={cn(
              'flex flex-col gap-4 pl-12 md:flex-row md:gap-8 md:pl-0',
              index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
            )}
            initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
            animate={
              isInView
                ? { opacity: 1, x: 0 }
                : { opacity: 0, x: index % 2 === 0 ? -50 : 50 }
            }
            transition={{ delay: index * 0.2 }}
          >
            {/* Content */}
            <div className="flex-1">
              <motion.div
                className="rounded-lg border border-primary/10 bg-primary/5 p-4 backdrop-blur-sm md:p-6"
                whileHover={{
                  scale: 1.02,
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 p-1.5 md:p-2">
                    {event.icon}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {event.date}
                  </span>
                </div>
                <h3 className="mb-1 text-base font-bold md:text-lg">
                  {event.title}
                </h3>
                {event.description && (
                  <p className="text-sm text-muted-foreground">
                    {event.description}
                  </p>
                )}
                <div className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs">
                  {event.type}
                </div>
              </motion.div>
            </div>

            {/* Timeline Node */}
            <motion.div
              className="absolute top-6 left-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-background md:relative md:top-auto md:left-auto"
              initial={{ scale: 0 }}
              animate={isInView ? { scale: 1 } : { scale: 0 }}
              transition={{ delay: index * 0.2 + 0.5 }}
            >
              <div className="h-2 w-2 rounded-full bg-primary" />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                initial={{ scale: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  repeatDelay: 2,
                }}
              />
            </motion.div>

            {/* Empty flex-1 for layout - only visible on desktop */}
            <div className="hidden flex-1 md:block" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
