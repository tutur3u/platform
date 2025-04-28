'use client';

import GradientHeadline from '../../gradient-headline';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { ArrowRight, BrainCircuit, Heart } from '@tuturuuu/ui/icons';
import { type Variants, motion } from 'framer-motion';
import Link from 'next/link';

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
              className="absolute inset-0 border border-foreground/5 bg-foreground/5 opacity-100 transition-opacity"
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
          className="mb-6 text-center text-4xl font-bold tracking-tight text-balance text-foreground md:text-6xl lg:text-7xl"
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
          className="mb-8 max-w-2xl text-center text-lg text-balance text-foreground/70"
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
            <GetStartedButton text="Get Early Access" href="/register" />
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <Link href="#features">
              <Button
                variant="outline"
                className="group relative overflow-hidden"
              >
                <motion.span
                  className="absolute inset-0 bg-primary/10"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.5 }}
                />
                <span className="relative z-10 flex items-center">
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* App mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="relative mt-8 w-full max-w-3xl"
        >
          <div className="flex aspect-video items-center justify-center rounded-xl border border-foreground/10 bg-gradient-to-br from-primary/10 via-purple-500/10 to-blue-500/10 shadow-lg dark:border-foreground/5 dark:from-primary/20 dark:via-purple-500/20 dark:to-blue-500/20">
            <div className="p-8 text-center">
              <BrainCircuit className="mx-auto mb-4 h-16 w-16 text-primary" />
              <p className="text-lg font-medium">Famigo App Interface</p>
              <p className="text-sm text-muted-foreground">
                Family connection reimagined with AI
              </p>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-pink-500/10 blur-xl dark:bg-pink-500/20"></div>
          <div className="absolute -top-4 -left-4 h-24 w-24 rounded-full bg-blue-500/10 blur-xl dark:bg-blue-500/20"></div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
