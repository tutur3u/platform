'use client';

import RoadmapItem from './RoadmapItem';
import { Badge } from '@tuturuuu/ui/badge';
import { BrainCircuit, RocketIcon, UserPlus, Users } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

const RoadmapSection = () => {
  return (
    <section id="roadmap" className="relative w-full py-24">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--primary-rgb),0.05),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(var(--primary-rgb),0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(var(--blue-rgb),0.05),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(var(--blue-rgb),0.1),transparent_50%)]"></div>

      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <Badge variant="outline" className="mb-4">
            Roadmap
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Our Implementation Journey
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            From research to full deployment, we're committed to creating a
            solution that respects Vietnamese cultural nuances while embracing
            innovative technology.
          </p>
        </motion.div>

        <div className="mx-auto max-w-3xl">
          <RoadmapItem
            date="Q2 2025"
            title="Beta Launch"
            description="Initial release with core features for select Vietnamese families to test and provide feedback."
            icon={<RocketIcon className="h-5 w-5" />}
            color="blue"
          />

          <RoadmapItem
            date="Q3 2025"
            title="AI Enhancement Phase"
            description="Refining emotional intelligence capabilities based on initial user data and cultural patterns."
            icon={<BrainCircuit className="h-5 w-5" />}
            color="purple"
          />

          <RoadmapItem
            date="Q4 2025"
            title="Urban Market Expansion"
            description="Full release to major Vietnamese cities with tailored features for urban family dynamics."
            icon={<UserPlus className="h-5 w-5" />}
            color="pink"
          />

          <RoadmapItem
            date="Q1 2026"
            title="Regional Adaptation"
            description="Expanding to Southeast Asian markets with cultural localization and new AI models."
            icon={<Users className="h-5 w-5" />}
            color="green"
          />

          {/* Final element - no line */}
          <div className="flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="border-foreground/10 bg-background/50 text-muted-foreground dark:border-foreground/5 mt-4 rounded-full border px-4 py-1 text-sm"
            >
              And beyond...
            </motion.div>
          </div>
        </div>

        {/* Decorative light rays */}
        <div className="via-primary/20 absolute left-0 top-1/3 h-[500px] w-[1px] bg-gradient-to-b from-transparent to-transparent"></div>
        <div className="absolute right-0 top-2/3 h-[300px] w-[1px] bg-gradient-to-b from-transparent via-blue-500/20 to-transparent"></div>
      </div>
    </section>
  );
};

export default RoadmapSection;
