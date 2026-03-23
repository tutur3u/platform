'use client';

import { Badge } from '@ncthub/ui/badge';
import { Calendar, Sparkles } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

export default function NeoMeetHeader() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Badge */}
      <div className="mb-6 inline-flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#FBC721]" />
        <Badge
          variant="outline"
          className="border-[#5FC6E5]/50 px-3 py-1 text-sm text-[#5FC6E5]"
        >
          Meet Together
        </Badge>
        <Sparkles className="h-5 w-5 text-[#FBC721]" />
      </div>

      <h1 className="mb-6 text-3xl font-bold text-balance text-foreground md:text-5xl lg:text-6xl">
        <span>Welcome to</span>{' '}
        <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
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
      <p className="mx-auto max-w-2xl text-lg text-balance text-foreground/80 md:text-xl">
        Find the best time slot for everyone, hassle-free.
      </p>
    </div>
  );
}
