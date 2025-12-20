'use client';

import {
  ArrowRight,
  Brain,
  CheckCircle,
  Github,
  Globe2,
  Mail,
  Rocket,
  Star,
  Target,
  Users,
} from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

const benefits = [
  {
    title: 'Innovation & Growth',
    description: 'Be at the forefront of technological advancement',
    features: ['Cutting-edge projects', 'Continuous learning', 'Career growth'],
    icon: <Brain className="h-6 w-6 text-primary" />,
    gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
    metrics: { projects: '50+', growth: '2x faster' },
  },
  {
    title: 'Global Impact',
    description: 'Make a difference on a global scale',
    features: ['Worldwide reach', 'Meaningful work', 'Social impact'],
    icon: <Globe2 className="h-6 w-6 text-primary" />,
    gradient: 'from-purple-500/20 via-pink-500/10 to-transparent',
    metrics: { reach: '20+ countries', impact: '10K+ users' },
  },
  {
    title: 'Future-Forward',
    description: 'Shape the technologies of tomorrow',
    features: ['AI development', 'Research opportunities', 'Innovation focus'],
    icon: <Rocket className="h-6 w-6 text-primary" />,
    gradient: 'from-green-500/20 via-emerald-500/10 to-transparent',
    metrics: { innovations: '100+', success: '95%' },
  },
];

export function JoinUsSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-0 -left-32 h-80 w-[20rem] rounded-full bg-linear-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-[30%] -right-32 h-70 w-70 rounded-full bg-linear-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute -bottom-32 left-1/2 h-90 w-90 -translate-x-1/2 rounded-full bg-linear-to-br from-green-500/20 via-emerald-500/15 to-transparent blur-3xl sm:-bottom-64 sm:h-180 sm:w-180"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-size-[120px] opacity-20" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.1, 0.15, 0.1] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-24">
        <div className="mb-24 text-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
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
              className="group mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
            >
              <Users className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
            </motion.div>
            <motion.h2
              className="mb-6 font-bold text-4xl text-foreground md:text-5xl lg:text-6xl"
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
                className="relative text-balance bg-linear-to-r bg-size-[200%_auto] from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
              >
                Be Part of Our Story
              </motion.span>
            </motion.h2>
            <motion.p
              className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground md:text-xl"
              whileHover={{
                scale: 1.01,
              }}
            >
              Whether you&apos;re a visionary, creator, or someone who believes
              in the power of technology to transform lives, there&apos;s a
              place for you in our mission to revolutionize the world through
              innovation.
            </motion.p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              {[
                {
                  icon: <Star className="h-5 w-5" />,
                  text: 'Join a world-class team',
                  metric: '100+ experts',
                },
                {
                  icon: <Globe2 className="h-5 w-5" />,
                  text: 'Work from anywhere',
                  metric: '20+ countries',
                },
                {
                  icon: <Target className="h-5 w-5" />,
                  text: 'Shape the future',
                  metric: '10+ products',
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="group flex items-center gap-4 rounded-full border border-primary/10 bg-background/50 py-3 pr-6 pl-3 backdrop-blur-sm"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                    {item.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{item.text}</div>
                    <div className="text-primary text-sm">{item.metric}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mb-24 grid gap-8 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="group"
            >
              <Card className="relative h-full overflow-hidden bg-background/50 backdrop-blur-sm">
                <div className="relative flex h-full flex-col bg-primary/5 p-8 transition-all duration-300 group-hover:bg-primary/10">
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    className={`absolute inset-0 bg-linear-to-br group-hover:opacity-100 ${benefit.gradient} transition-opacity duration-300`}
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
                    className={`absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-linear-to-br ${benefit.gradient} blur-2xl`}
                  />
                  <div className="pointer-events-none relative">
                    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                      {benefit.icon}
                    </div>
                    <h3 className="mb-3 font-bold text-2xl">{benefit.title}</h3>
                    <p className="mb-6 text-muted-foreground">
                      {benefit.description}
                    </p>
                    <div className="space-y-3">
                      {benefit.features.map((feature, i) => (
                        <motion.div
                          key={i}
                          initial={false}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-3 backdrop-blur-sm"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <CheckCircle className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{feature}</span>
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      {Object.entries(benefit.metrics).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="font-bold text-primary text-sm">
                            {value}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {key}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileHover={{ scaleX: 1 }}
                    transition={{ duration: 0.3 }}
                    className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-linear-to-r from-primary/20 to-primary/5"
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <motion.a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full overflow-hidden rounded-lg bg-foreground px-8 py-3 text-background transition-transform hover:scale-105 sm:w-auto"
          >
            <div className="absolute inset-0 bg-linear-to-r from-primary/20 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex items-center justify-center gap-2 font-medium">
              <Github className="h-5 w-5" />
              Explore Our Work
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </motion.a>

          <motion.a
            href="/contact"
            className="group relative w-full overflow-hidden rounded-lg bg-primary/10 px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
          >
            <div className="absolute inset-0 bg-linear-to-r from-primary/10 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex items-center justify-center gap-2 font-medium">
              <Mail className="h-5 w-5" />
              Get in Touch
              <ArrowRight className="h-4 w-4 transition-transform group-hover:rotate-90" />
            </span>
          </motion.a>
        </div>
      </div>
    </motion.section>
  );
}
