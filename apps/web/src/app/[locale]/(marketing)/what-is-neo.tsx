'use client';

import { Badge } from '@ncthub/ui/badge';
import { Card, CardContent } from '@ncthub/ui/card';
import { GetStartedButton } from '@ncthub/ui/custom/get-started-button';
import {
  Award,
  Building2,
  Code,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const stats = [
  {
    number: '100+',
    content: 'Active Members',
    icon: Users,
    gradient: 'from-blue-500 to-cyan-500',
    description: 'Passionate tech enthusiasts',
  },
  {
    number: '70+',
    content: 'Student Projects',
    icon: Code,
    gradient: 'from-purple-500 to-pink-500',
    description: 'Innovation driven solutions',
  },
  {
    number: '50+',
    content: 'Industry Partners',
    icon: Building2,
    gradient: 'from-green-500 to-emerald-500',
    description: 'Leading tech companies',
  },
];

export default function WhatIsNeo() {
  const t = useTranslations();

  return (
    <motion.div
      className="mt-4 flex flex-col items-center text-center md:mt-28"
      initial={{ opacity: 0, y: 50 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      {/* Hero Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        viewport={{ once: true }}
        className="mb-6 inline-flex items-center gap-2"
      >
        <Sparkles className="h-6 w-6 text-[#FBC721]" />
        <Badge
          variant="outline"
          className="border-[#5FC6E5]/50 px-4 py-2 text-base text-[#5FC6E5]"
        >
          Welcome to the Future
        </Badge>
        <Sparkles className="h-6 w-6 text-[#FBC721]" />
      </motion.div>

      {/* Main Title */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <h1 className="mb-2 text-4xl leading-normal font-extrabold md:text-5xl lg:text-6xl">
          What is{' '}
          <span className="relative">
            <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
              NEO Culture
            </span>
            <motion.div
              className="absolute -top-2 -right-2"
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            >
              <Award className="h-6 w-6 text-[#FBC721]" />
            </motion.div>
          </span>{' '}
          Tech?
        </h1>
      </motion.div>

      {/* Description */}
      <motion.div
        className="mb-2 lg:w-2/3"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        viewport={{ once: true }}
      >
        <p className="mt-6 text-lg font-semibold tracking-wide md:text-xl lg:mt-10 lg:text-3xl">
          Founded in 2019, we are the best club for
          <span className="relative text-[#5FC6E5]">
            {' '}
            SSET students{' '}
            <motion.div
              className="absolute right-0 -bottom-1 left-0 h-0.5 bg-gradient-to-r from-[#5FC6E5] to-[#FBC721]"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 1 }}
              viewport={{ once: true }}
            />
          </span>
          to explore the world of technology at RMIT University.
        </p>
      </motion.div>

      {/* Enhanced Stats Section */}
      <motion.div
        className="my-12 w-full max-w-6xl"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="grid grid-cols-1 gap-8 px-4 md:grid-cols-3">
          {stats.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 + index * 0.2 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
              className="group"
            >
              <Card className="relative overflow-hidden border-2 bg-gradient-to-br from-background/50 to-background backdrop-blur-sm transition-all duration-300 hover:border-primary/50">
                {/* Background gradient effect */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`}
                />

                <CardContent className="relative p-8">
                  {/* Icon */}
                  <div
                    className={`mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-r ${item.gradient} p-0.5`}
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
                      <item.icon className="h-8 w-8 text-foreground transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>

                  {/* Number with counter animation */}
                  <motion.div
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 100,
                      delay: 1.2 + index * 0.2,
                    }}
                    viewport={{ once: true }}
                  >
                    <p
                      className={`bg-gradient-to-r text-4xl font-extrabold md:text-5xl lg:text-6xl ${item.gradient} mb-2 bg-clip-text text-transparent`}
                    >
                      {item.number}
                    </p>
                  </motion.div>

                  {/* Title */}
                  <h3 className="mb-2 text-xl font-bold lg:text-2xl">
                    {item.content.split(' ').map((word, i) => (
                      <span key={i} className="block">
                        {word}
                      </span>
                    ))}
                  </h3>

                  {/* Description */}
                  <p className="mb-4 text-sm text-muted-foreground">
                    {item.description}
                  </p>

                  {/* Trending indicator */}
                  <div className="flex items-center justify-center gap-1 text-green-500">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-medium">Growing</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Enhanced CTA Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.4 }}
        viewport={{ once: true }}
        className="mt-8"
      >
        <Card className="mx-auto mb-8 max-w-md border-[#5FC6E5]/20 bg-gradient-to-r from-[#5FC6E5]/10 to-[#FBC721]/10">
          <CardContent className="p-6 text-center">
            <Target className="mx-auto mb-3 h-8 w-8 text-[#5FC6E5]" />
            <h3 className="mb-2 text-lg font-semibold">
              Ready to Start Your Journey?
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Join hundreds of students already building their tech careers with
              us
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>✨ Free to join</span>
              <span>•</span>
              <span>🚀 Instant access</span>
              <span>•</span>
              <span>🎯 Career focused</span>
            </div>
          </CardContent>
        </Card>

        <div className="inline-block">
          <GetStartedButton href="/login" text={t('common.get-started')} />
        </div>
      </motion.div>
    </motion.div>
  );
}
