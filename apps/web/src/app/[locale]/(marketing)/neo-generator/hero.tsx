'use client';

import { Badge } from '@ncthub/ui/badge';
import { Sparkles } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

export default function NeoGeneratorHero() {
  return (
    <motion.div
      className="mb-8 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Hero Badge */}
      <motion.div
        className="mb-6 inline-flex items-center gap-2"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Sparkles className="h-5 w-5 text-[#FBC721]" />
        <Badge
          variant="outline"
          className="border-[#5FC6E5]/50 px-3 py-1 text-sm text-[#5FC6E5]"
        >
          Text Style Generator
        </Badge>
        <Sparkles className="h-5 w-5 text-[#FBC721]" />
      </motion.div>

      <motion.h1
        className="mb-6 text-4xl font-bold text-balance text-foreground md:text-5xl lg:text-6xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <span>Welcome to</span>{' '}
        <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
          Neo Generator
        </span>
      </motion.h1>

      <motion.p
        className="mx-auto max-w-2xl text-lg text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        Transform your text into various Unicode styles including bold, italic,
        script, and more. Perfect for social media posts where regular
        formatting isn't available.
      </motion.p>
    </motion.div>
  );
}
