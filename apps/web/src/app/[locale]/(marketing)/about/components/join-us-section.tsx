'use client';

import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
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
} from 'lucide-react';

const benefits = [
  {
    title: 'Innovation & Growth',
    description: 'Be at the forefront of technological advancement',
    features: ['Cutting-edge projects', 'Continuous learning', 'Career growth'],
    icon: <Brain className="text-primary h-6 w-6" />,
    gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
    metrics: { projects: '50+', growth: '2x faster' },
  },
  {
    title: 'Global Impact',
    description: 'Make a difference on a global scale',
    features: ['Worldwide reach', 'Meaningful work', 'Social impact'],
    icon: <Globe2 className="text-primary h-6 w-6" />,
    gradient: 'from-purple-500/20 via-pink-500/10 to-transparent',
    metrics: { reach: '20+ countries', impact: '10K+ users' },
  },
  {
    title: 'Future-Forward',
    description: 'Shape the technologies of tomorrow',
    features: ['AI development', 'Research opportunities', 'Innovation focus'],
    icon: <Rocket className="text-primary h-6 w-6" />,
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
          className="absolute -left-32 top-0 h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
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
          className="absolute -right-32 top-[30%] h-[17.5rem] w-[17.5rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
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
          className="absolute -bottom-32 left-1/2 h-[22.5rem] w-[22.5rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-green-500/20 via-emerald-500/15 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:120px] opacity-20" />
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
              className="bg-primary/10 group mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            >
              <Users className="text-primary h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
            </motion.div>
            <motion.h2
              className="text-foreground mb-6 text-4xl font-bold md:text-5xl lg:text-6xl"
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
                className="from-primary relative text-balance bg-gradient-to-r via-purple-500 to-pink-500 bg-[length:200%_auto] bg-clip-text text-transparent"
              >
                Be Part of Our Story
              </motion.span>
            </motion.h2>
            <motion.p
              className="text-muted-foreground mx-auto mb-12 max-w-2xl text-lg md:text-xl"
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
                  className="bg-background/50 border-primary/10 group flex items-center gap-4 rounded-full border py-3 pl-3 pr-6 backdrop-blur-sm"
                >
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110">
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
              <Card className="bg-background/50 relative h-full overflow-hidden backdrop-blur-sm">
                <div className="bg-primary/5 group-hover:bg-primary/10 relative flex h-full flex-col p-8 transition-all duration-300">
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    className={`absolute inset-0 bg-gradient-to-br group-hover:opacity-100 ${benefit.gradient} transition-opacity duration-300`}
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
                    className={`absolute -right-8 -top-8 h-24 w-24 rounded-xl bg-gradient-to-br ${benefit.gradient} blur-2xl`}
                  />
                  <div className="pointer-events-none relative">
                    <div className="bg-primary/10 mb-6 flex h-14 w-14 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
                      {benefit.icon}
                    </div>
                    <h3 className="mb-3 text-2xl font-bold">{benefit.title}</h3>
                    <p className="text-muted-foreground mb-6">
                      {benefit.description}
                    </p>
                    <div className="space-y-3">
                      {benefit.features.map((feature, i) => (
                        <motion.div
                          key={i}
                          initial={false}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="bg-background/50 border-primary/10 flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm"
                        >
                          <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                            <CheckCircle className="text-primary h-4 w-4" />
                          </div>
                          <span className="font-medium">{feature}</span>
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      {Object.entries(benefit.metrics).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-primary text-sm font-bold">
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
                    className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 origin-left bg-gradient-to-r"
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <motion.a
            href="https://github.com/tutur3u"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground text-background group relative w-full overflow-hidden rounded-lg px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
          >
            <div className="from-primary/20 to-primary/0 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex items-center justify-center gap-2 font-medium">
              <Github className="h-5 w-5" />
              Explore Our Work
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </motion.a>

          <motion.a
            href="/contact"
            className="bg-primary/10 group relative w-full overflow-hidden rounded-lg px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
          >
            <div className="from-primary/10 to-primary/5 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
