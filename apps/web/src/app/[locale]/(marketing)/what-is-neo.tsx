'use client';

import { Badge } from '@ncthub/ui/badge';
import { Card, CardContent } from '@ncthub/ui/card';
import {
  Award,
  Building2,
  Code,
  Sparkles,
  TrendingUp,
  Users,
} from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

const stats = [
  {
    number: '70+',
    content: 'Active Members',
    icon: Users,
    gradient: 'from-blue-500 to-cyan-500',
    description: 'Passionate tech enthusiasts',
  },
  {
    number: '25+',
    content: 'Student Projects',
    icon: Code,
    gradient: 'from-purple-500 to-pink-500',
    description: 'Innovation driven solutions',
  },
  {
    number: '20+',
    content: 'Industry Partners',
    icon: Building2,
    gradient: 'from-green-500 to-emerald-500',
    description: 'Leading tech companies',
  },
];

export default function WhatIsNeo() {
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
          className="border-[#5FC6E5]/50 px-4 py-2 text-[#5FC6E5] text-base"
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
        <h1 className="mb-2 font-extrabold text-4xl leading-normal md:text-5xl lg:text-6xl">
          What is{' '}
          <span className="relative">
            <span className="whitespace-nowrap border-[#FBC721] border-b-4 text-[#5FC6E5]">
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
        <p className="mt-6 font-semibold text-lg tracking-wide md:text-xl lg:mt-10 lg:text-3xl">
          Founded in 2020, we are the best club for
          <span className="border-[#FBC721] border-b-2 -pb-1 text-[#5FC6E5]">
            {' '}
            SSET students
          </span>{' '}
          <span className="mt-1">
            to explore the world of technology at RMIT University.
          </span>
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
              <Card className="relative overflow-hidden border-2 bg-linear-to-br from-background/50 to-background backdrop-blur-sm transition-all duration-300 hover:border-primary/50">
                {/* Background gradient effect */}
                <div
                  className={`absolute inset-0 bg-linear-to-br ${item.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`}
                />

                <CardContent className="relative p-8">
                  {/* Icon */}
                  <div
                    className={`mx-auto mb-4 h-16 w-16 rounded-full bg-linear-to-r ${item.gradient} p-0.5`}
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
                      className={`bg-linear-to-r font-extrabold text-4xl md:text-5xl lg:text-6xl ${item.gradient} mb-2 bg-clip-text text-transparent`}
                    >
                      {item.number}
                    </p>
                  </motion.div>

                  {/* Title */}
                  <h3 className="mb-2 font-bold text-xl lg:text-2xl">
                    {item.content.split(' ').map((word, i) => (
                      <span key={i} className="block">
                        {word}
                      </span>
                    ))}
                  </h3>

                  {/* Description */}
                  <p className="mb-4 text-muted-foreground text-sm">
                    {item.description}
                  </p>

                  {/* Trending indicator */}
                  <div className="flex items-center justify-center gap-1 text-green-500">
                    <TrendingUp className="h-4 w-4" />
                    <span className="font-medium text-xs">Growing</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
