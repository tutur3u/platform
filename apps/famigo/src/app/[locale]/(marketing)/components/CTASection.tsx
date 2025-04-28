'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { Sparkles } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

const CTASection = () => {
  return (
    <section className="relative w-full overflow-hidden py-24">
      {/* Colorful background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-20%,rgba(var(--primary-rgb),0.15),transparent)] dark:bg-[radial-gradient(circle_800px_at_50%_-20%,rgba(var(--primary-rgb),0.2),transparent)]"></div>

      {/* Decorative elements */}
      <div className="absolute -top-20 -left-20 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>
      <div className="absolute -right-20 -bottom-20 h-60 w-60 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative mx-auto max-w-4xl px-4 text-center"
      >
        <Badge
          variant="outline"
          className="mb-4 bg-background/50 backdrop-blur-sm"
        >
          <Sparkles className="mr-2 h-4 w-4 text-pink-500 dark:text-pink-400" />
          Join Our Mission
        </Badge>

        <h2 className="mb-4 bg-gradient-to-r from-primary via-blue-500 to-purple-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl dark:from-primary dark:via-blue-400 dark:to-purple-400">
          Be Part of the Family Connection Revolution
        </h2>

        <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
          Join our early access program and help shape the future of family
          communication in Vietnam. Together, we can bridge generations and
          foster deeper understanding between parents and children.
        </p>

        <motion.div
          className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <GetStartedButton text="Get Early Access" href="/home" />
        </motion.div>

        {/* Bonus element: Floating hearts representing family connection */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{
                y: 0,
                x: Math.random() * 100 - 50,
                opacity: 0.3 + Math.random() * 0.7,
              }}
              animate={{
                y: -1000,
                opacity: 0,
                transition: {
                  duration: 15 + Math.random() * 10,
                  repeat: Infinity,
                  delay: i * 3,
                  ease: 'linear',
                },
              }}
              className="absolute bottom-0 left-1/2"
            >
              <div
                className={`h-6 w-6 ${i % 2 === 0 ? 'text-pink-500/30' : 'text-primary/30'} ${i % 3 === 0 ? 'animate-pulse' : ''} `}
              >
                ❤️
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
};

export default CTASection;
