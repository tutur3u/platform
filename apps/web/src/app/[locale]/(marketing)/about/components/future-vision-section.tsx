'use client';

import { Laptop, Shield, Target, Zap } from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const futureItems: ItemProps[] = [
  {
    icon: <Zap className="h-8 w-8 text-primary" />,
    title: 'Next-Gen AI',
    description:
      'Developing revolutionary AI systems that will transform how we interact with technology.',
  },
  {
    icon: <Laptop className="h-8 w-8 text-primary" />,
    title: 'Universal Platform',
    description:
      'Creating a unified platform that brings powerful tools to everyone, everywhere.',
  },
  {
    icon: <Target className="h-8 w-8 text-primary" />,
    title: 'Global Expansion',
    description:
      'Extending our reach to empower more communities and transform more lives.',
  },
  {
    icon: <Shield className="h-8 w-8 text-primary" />,
    title: 'Trusted Future',
    description:
      'Building a future where technology serves humanity with security and reliability.',
  },
];

export function FutureVisionSection() {
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
            className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
          >
            <Target className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
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
              className="relative bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent"
            >
              Building Tomorrow
            </motion.span>
          </motion.h2>
          <motion.p
            className="mx-auto max-w-2xl text-lg text-foreground/60"
            whileHover={{
              scale: 1.01,
            }}
          >
            Our vision for the future is bold and clear: to lead the next wave
            of technological innovation while ensuring it serves humanity&apos;s
            best interests
          </motion.p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-4">
          {futureItems.map((item, index) => (
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
                  className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent transition-opacity duration-300"
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
                  className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-transparent blur-2xl"
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
                  className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r from-primary/20 to-primary/5"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
