'use client';

import { Brain, Globe, Heart } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const purposeItems: ItemProps[] = [
  {
    icon: <Heart className="text-primary h-8 w-8" />,
    title: 'Universal Access',
    description:
      'We believe everyone deserves access to life-changing technology. Our solutions are designed to reach and empower people from all walks of life, everywhere.',
  },
  {
    icon: <Brain className="text-primary h-8 w-8" />,
    title: 'Breakthrough Innovation',
    description:
      'Through cutting-edge AI and relentless innovation, we push the boundaries of what technology can achieve to create transformative solutions.',
  },
  {
    icon: <Globe className="text-primary h-8 w-8" />,
    title: 'Worldwide Impact',
    description:
      'From bustling cities to remote villages, we are committed to delivering technology that makes a real difference in daily lives.',
  },
];

export function PurposeSection() {
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
          className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
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
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px]"
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
            className="bg-primary/10 group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          >
            <Heart className="text-primary h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
          </motion.div>
          <motion.h2
            className="text-foreground mb-4 text-4xl font-bold"
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
              className="from-primary relative bg-gradient-to-r via-orange-500 to-red-500 bg-[length:200%_auto] bg-clip-text text-transparent"
            >
              Our Purpose
            </motion.span>
          </motion.h2>
          <motion.p
            className="text-foreground/60 mx-auto max-w-2xl text-lg"
            whileHover={{
              scale: 1.01,
            }}
          >
            We exist to push the boundaries of technology, creating innovations
            that transform lives and make the world better for everyone, without
            exception
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {purposeItems.map((item, index) => (
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
              <div className="bg-foreground/5 relative h-full overflow-hidden rounded-2xl backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent transition-opacity duration-300"
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
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent blur-2xl"
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
                    <div className="bg-primary/10 group-hover:bg-primary/20 mx-auto flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
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
                    className="text-foreground relative mb-4 text-xl font-bold"
                    whileHover={{
                      scale: 1.05,
                      color: 'hsl(var(--primary))',
                    }}
                  >
                    {item.title}
                  </motion.h3>
                  <motion.p
                    className="text-foreground/60 relative"
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
                  className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 origin-left bg-gradient-to-r"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
