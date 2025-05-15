'use client';

import FeatureCard from './FeatureCard';
import { Badge } from '@tuturuuu/ui/badge';
import { Clock, MessageCircle, Users } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

const ProblemSection = () => {
  return (
    <section
      id="problem"
      className="bg-foreground/5 dark:bg-foreground/[0.02] relative w-full py-24"
    >
      {/* Background patterns */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--background-rgb),0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(var(--background-rgb),0.01)_1px,transparent_1px)] bg-size-[14px_24px]"></div>

      <div className="mx-auto max-w-6xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <Badge variant="outline" className="mb-4">
            The Challenge
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Bridging the Generational Gap in Vietnamese Families
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            In Vietnam's rapidly modernizing society, Generation Z faces unique
            challenges while navigating between tradition and transformation.
            Communication barriers with parents threaten family harmony and
            emotional wellbeing.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon={<Users className="h-6 w-6" />}
            title="Hierarchical Culture"
            description="Vietnamese families are influenced by Confucian values
                emphasizing hierarchy and respect for elders, often creating
                one-way communication patterns."
            color="red"
          />

          <FeatureCard
            icon={<Clock className="h-6 w-6" />}
            title="Different Life Experiences"
            description="While youth embrace global ideas and digital connectivity,
                parents often follow traditional values, creating emotional
                distance and misunderstandings."
            color="amber"
          />

          <FeatureCard
            icon={<MessageCircle className="h-6 w-6" />}
            title="Emotional Expression"
            description="Studies show 8-29% of Vietnamese youth experience mental
                health challenges they don't share with parents, deepening the
                communication gap."
            color="blue"
          />
        </div>

        {/* Visual element - decorative line connecting the problems */}
        <div className="relative mt-12 hidden md:block">
          <div className="right-1/6 left-1/6 via-foreground/10 absolute top-0 h-px bg-linear-to-r from-transparent to-transparent"></div>
          <div className="from-foreground/10 absolute left-1/2 top-0 h-8 w-px -translate-x-1/2 bg-linear-to-b to-transparent"></div>
          <div className="border-foreground/10 bg-background/50 absolute left-1/2 top-8 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border text-xs font-medium">
            <span className="from-primary bg-linear-to-r to-blue-500 bg-clip-text text-transparent">
              Famigo
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
