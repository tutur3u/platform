'use client';

import GradientHeadline from '../../gradient-headline';
import { Badge } from '@tuturuuu/ui/badge';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { BrainCircuit, Heart } from '@tuturuuu/ui/icons';
import { type Variants, motion } from 'framer-motion';

const HeroSection = () => {
  // Enhanced floating effect variants with reduced movement for better performance
  const floatingVariants = {
    initial: { y: 0 },
    float: {
      y: [-8, 8],
      transition: {
        duration: 5,
        repeat: Infinity,
        repeatType: 'mirror',
        ease: 'easeInOut',
      },
    },
  } as Variants;

  return (
    <section id="hero" className="relative w-full">
      {/* Background gradient effects */}
      {/* <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background to-background/0 dark:from-background/30 dark:to-background/10"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_800px_at_10%_20%,rgba(var(--primary-rgb),0.08),transparent)] dark:bg-[radial-gradient(circle_800px_at_10%_20%,rgba(var(--primary-rgb),0.15),transparent)]"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_800px_at_90%_70%,rgba(var(--blue-rgb),0.08),transparent)] dark:bg-[radial-gradient(circle_800px_at_90%_70%,rgba(var(--blue-rgb),0.15),transparent)]"></div> */}

      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 sm:py-32">
        <motion.div
          variants={floatingVariants}
          initial="initial"
          animate="float"
          className="relative"
        >
          <Badge
            variant="outline"
            className="group relative mb-8 overflow-hidden border-transparent backdrop-blur-sm"
          >
            <motion.div
              className="border-foreground/5 bg-foreground/5 absolute inset-0 border opacity-100 transition-opacity"
              whileHover={{ opacity: 1 }}
            />
            <Heart className="mr-2 h-4 w-4 text-pink-500 dark:text-pink-400" />
            <span className="relative z-10">AI for Peace Communication</span>
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-foreground mb-6 text-balance text-center text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl"
        >
          <GradientHeadline title="Famigo" />
          <span className="mt-4 block text-3xl md:text-4xl lg:text-5xl">
            Bridging Generations with AI
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="text-foreground/70 mb-8 max-w-2xl text-balance text-center text-lg"
        >
          An AI-integrated solution for strengthening Vietnamese parent-child
          relationships across the intergenerational gap. Fostering empathy,
          understanding, and meaningful connections in families.
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mb-12 flex flex-col items-center gap-4 sm:flex-row"
        >
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <GetStartedButton text="Get Early Access" href="/home" />
          </motion.div>
        </motion.div>

        {/* App mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="relative mt-8 w-full max-w-3xl"
        >
          <div className="border-foreground/10 from-primary/10 dark:border-foreground/5 dark:from-primary/20 flex aspect-video items-center justify-center rounded-xl border bg-gradient-to-br via-purple-500/10 to-blue-500/10 shadow-lg dark:via-purple-500/20 dark:to-blue-500/20">
            <div className="p-8 text-center">
              <BrainCircuit className="text-primary mx-auto mb-4 h-16 w-16" />
              <p className="text-lg font-medium">Famigo App Interface</p>
              <p className="text-muted-foreground text-sm">
                Family connection reimagined with AI
              </p>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-pink-500/10 blur-xl dark:bg-pink-500/20"></div>
          <div className="absolute -left-4 -top-4 h-24 w-24 rounded-full bg-blue-500/10 blur-xl dark:bg-blue-500/20"></div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
