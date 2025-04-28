'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  BrainCircuit,
  Calendar,
  Share2,
  ShieldCheck,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

const TechnologySection = () => {
  const technologies = [
    {
      icon: <BrainCircuit className="h-5 w-5" />,
      title: 'AI Emotional Mediation Layer',
      description:
        'Natural language understanding, emotional tone detection, and empathetic narrative generation.',
      color: 'purple',
    },
    {
      icon: <Share2 className="h-5 w-5" />,
      title: 'Social Interaction Layer',
      description:
        'Real-time interaction hub for visual and emotional updates through snapshots and mood indicators.',
      color: 'pink',
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      title: 'Family Coordination Layer',
      description:
        'Smart calendar assistant that synchronizes with external platforms and suggests optimal times for activities.',
      color: 'blue',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Privacy and Consent Management',
      description:
        'End-to-end encryption with user control over what is shared, ensuring psychological safety and data privacy.',
      color: 'green',
    },
  ];

  // Get icon background colors
  const getIconBgColor = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
      case 'purple':
        return 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/10 text-pink-500 dark:bg-pink-500/20 dark:text-pink-400';
      case 'green':
        return 'bg-green-500/10 text-green-500 dark:bg-green-500/20 dark:text-green-400';
      default:
        return 'bg-primary/10 text-primary dark:bg-primary/20';
    }
  };

  return (
    <section
      id="technology"
      className="bg-foreground/5 dark:bg-foreground/[0.02] relative w-full py-24"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-40 dark:opacity-20">
        <div className="absolute -left-4 top-1/3 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl"></div>
        <div className="absolute -right-4 top-2/3 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl"></div>
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-16 text-center">
          <Badge variant="outline" className="mb-4">
            Technology
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Built With Cutting-Edge AI
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            Powered by Google's Mental Health Companion AI via the Gemini API,
            enabling empathetic, context-aware support for families.
          </p>
        </div>

        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h3 className="text-2xl font-bold">System Architecture</h3>
            <div className="space-y-4">
              {technologies.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <div
                    className={`mt-1 rounded-full p-2 ${getIconBgColor(
                      item.color
                    )}`}
                  >
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            {/* AI visualization */}
            <div className="border-foreground/10 bg-background/30 dark:border-foreground/5 relative rounded-xl border backdrop-blur-sm">
              <div className="from-primary/10 absolute inset-0 rounded-xl bg-gradient-to-br via-transparent to-transparent"></div>
              <div className="relative p-8">
                <div className="flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20">
                  <div className="text-center">
                    <div className="border-foreground/10 bg-background/40 mx-auto flex h-32 w-32 items-center justify-center rounded-full border backdrop-blur-md">
                      <span className="text-5xl">👨‍👩‍👧‍👦</span>
                    </div>
                    <div className="border-foreground/10 bg-background/40 mt-4 rounded-lg border p-4 backdrop-blur-md">
                      <h4 className="text-lg font-bold">Fami AI</h4>
                      <p className="text-muted-foreground text-sm">
                        Emotionally intelligent family companion
                      </p>
                    </div>

                    {/* Add animated connection lines */}
                    <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2">
                      <div className="border-foreground/10 absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed opacity-50"></div>
                      <div className="border-foreground/10 absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed opacity-30"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TechnologySection;
