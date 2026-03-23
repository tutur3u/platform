'use client';

import { Badge } from '@ncthub/ui/badge';
import { Calendar, Sparkles } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

export default function NeoMeetHeader() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Badge */}
      <div className="mb-6 inline-flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-light-yellow" />
        <Badge
          variant="outline"
          className="border-brand-light-blue/50 px-3 py-1 text-brand-light-blue text-sm"
        >
          Meet Together
        </Badge>
        <Sparkles className="h-5 w-5 text-brand-light-yellow" />
      </div>

      <h1 className="mb-6 text-balance font-bold text-3xl text-foreground md:text-5xl lg:text-6xl">
        <span>Welcome to</span>{' '}
        <span className="whitespace-nowrap border-brand-light-yellow border-b-4 text-brand-light-blue">
          Neo Meet{' '}
          <motion.div
            className="inline-block"
            animate={{
              rotate: [0, 15, -15, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <Calendar className="inline-block h-8 w-8 text-yellow-400 md:h-10 md:w-10 lg:h-12 lg:w-12" />
          </motion.div>
        </span>
      </h1>
      <p className="mx-auto max-w-2xl text-balance text-foreground/80 text-lg md:text-xl">
        Find the best time slot for everyone, hassle-free.
      </p>
    </div>
  );
}
