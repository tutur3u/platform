'use client';

import { Award, Heart, Sparkles, Users } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface ItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const achievementItems: ItemProps[] = [
  {
    icon: <Award className="h-8 w-8 text-primary" />,
    title: 'Technical Excellence',
    description:
      'Setting new standards in software development with cutting-edge solutions.',
  },
  {
    icon: <Users className="h-8 w-8 text-primary" />,
    title: 'Growing Community',
    description:
      'Building a vibrant ecosystem of developers, creators, and innovators.',
  },
  {
    icon: <Sparkles className="h-8 w-8 text-primary" />,
    title: 'Innovation Awards',
    description:
      'Recognized for groundbreaking contributions to technology and human advancement.',
  },
  {
    icon: <Heart className="h-8 w-8 text-primary" />,
    title: 'Social Impact',
    description:
      'Making a real difference in communities worldwide through accessible technology.',
  },
];

export function AchievementsSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative text-center"
    >
      <div className="absolute inset-0 -z-10">
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
          className="absolute inset-0 bg-[conic-gradient(from_270deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
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
            <Award className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
          </motion.div>
          <motion.h2
            className="mb-4 text-4xl font-bold text-foreground"
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
              className="relative bg-linear-to-r from-primary via-purple-500 to-pink-500 bg-size-[200%_auto] bg-clip-text text-transparent"
            >
              Our Achievements
            </motion.span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-lg text-foreground/60"
            whileHover={{
              scale: 1.01,
            }}
          >
            While we&apos;re proud of how far we&apos;ve come, we see our
            achievements not as destinations, but as stepping stones toward
            greater impact
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-4">
          {achievementItems.map((item, index) => (
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
              <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 backdrop-blur-sm">
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
                  className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-linear-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
                />
                <div className="pointer-events-none relative p-8">
                  <motion.div
                    whileHover={{
                      rotate: [0, 10, -10, 0],
                      scale: 1.1,
                    }}
                    transition={{
                      duration: 0.3,
                    }}
                    className="relative mb-6"
                  >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                      <motion.div
                        animate={{
                          scale: [1, 1.1, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      >
                        {item.icon}
                      </motion.div>
                    </div>
                  </motion.div>
                  <motion.h3
                    className="relative mb-4 text-xl font-bold text-foreground"
                    whileHover={{
                      scale: 1.05,
                      color: 'hsl(var(--primary))',
                    }}
                  >
                    {item.title}
                  </motion.h3>
                  <motion.p
                    className="relative text-foreground/60"
                    whileHover={{
                      scale: 1.02,
                    }}
                  >
                    {item.description}
                  </motion.p>
                </div>
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
