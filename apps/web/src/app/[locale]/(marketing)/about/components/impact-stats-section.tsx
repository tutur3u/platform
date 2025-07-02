'use client';

import { BarChart } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

interface StatProps {
  value: string;
  label: string;
  description: string;
}

const impactStats: StatProps[] = [
  {
    value: '24/7',
    label: 'Innovation',
    description: 'Constant breakthroughs',
  },
  {
    value: '100%',
    label: 'Commitment',
    description: 'To excellence',
  },
  {
    value: '10K+',
    label: 'Lives Changed',
    description: 'And growing daily',
  },
  {
    value: '∞',
    label: 'Possibilities',
    description: 'Limitless potential',
  },
];

export function ImpactStatsSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative text-center"
    >
      <div className="-z-10 absolute inset-0">
        <motion.div
          animate={{
            opacity: [0.1, 0.15, 0.1],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]"
        />
        <motion.div
          animate={{
            rotate: [0, 360],
          }}
          transition={{
            duration: 60,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
        />
        <motion.div
          animate={{
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-size-[100px]"
        />
      </div>

      <div className="relative">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <motion.div
            whileHover={{
              scale: 1.1,
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              rotate: {
                duration: 0.5,
                ease: 'easeInOut',
              },
            }}
            className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
          >
            <BarChart className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
          </motion.div>
          <motion.h2
            className="mb-4 font-bold text-4xl text-foreground"
            whileHover={{
              scale: 1.02,
            }}
          >
            <motion.span
              animate={{
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="relative bg-linear-to-r bg-size-[200%_auto] from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
            >
              Our Growing Impact
            </motion.span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-foreground/60 text-lg"
            whileHover={{
              scale: 1.01,
            }}
          >
            Every number represents lives touched, dreams enabled, and steps
            taken toward our vision of becoming a world-leading technology
            innovator
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-4">
          {impactStats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{
                y: -5,
                transition: {
                  duration: 0.2,
                  ease: 'easeOut',
                },
              }}
              className="group relative"
            >
              <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 p-8 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-pink-500/5 to-transparent transition-opacity duration-300"
                />
                <motion.div
                  animate={{
                    rotate: [0, 360],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="-top-8 -right-8 absolute h-24 w-24 rounded-xl bg-linear-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
                />
                <motion.div
                  className="pointer-events-none relative mb-2 font-bold text-4xl text-primary"
                  whileHover={{
                    scale: 1.1,
                    color: 'hsl(var(--primary))',
                  }}
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  {stat.value}
                </motion.div>
                <motion.div
                  className="pointer-events-none relative mb-1 font-medium text-foreground text-lg"
                  whileHover={{
                    scale: 1.05,
                    color: 'hsl(var(--primary))',
                  }}
                >
                  {stat.label}
                </motion.div>
                <motion.div
                  className="pointer-events-none relative text-foreground/60 text-sm"
                  whileHover={{
                    scale: 1.02,
                  }}
                >
                  {stat.description}
                </motion.div>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={{ duration: 0.3 }}
                  className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-linear-to-r from-primary/20 to-primary/5"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
