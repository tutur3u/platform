'use client';

import { Bot } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function MainProject() {
  return (
    <>
      <motion.div
        className="relative mt-4 flex flex-col items-center text-center md:mt-28"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="text-4xl leading-normal font-extrabold md:text-5xl lg:text-6xl">
            <span className="text-foreground">NEO Culture</span>{' '}
            <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
              PROJECTS{' '}
              <motion.div
                className="inline-block"
                animate={{
                  rotate: [0, 15, -15, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Bot className="inline-block h-8 w-8 text-yellow-400 md:h-10 md:w-10 lg:h-12 lg:w-12" />
              </motion.div>
            </span>
          </div>
          <div className="mt-1 w-2/3 md:w-full">
            <p className="text-lg leading-normal text-muted-foreground md:mt-4 md:max-w-2xl md:text-xl">
              The place where you can learn, grow and have fun with technology,
              by building projects.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="relative mt-8 flex flex-col items-center text-center md:mt-4"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <p className="text-2xl leading-normal font-extrabold md:text-3xl lg:text-4xl">
          <span className="text-foreground">Our</span>{' '}
          <span className="border-b-4 border-[#FBC721] whitespace-nowrap text-[#5FC6E5]">
            Flagship
          </span>{' '}
          <span className="text-foreground">Project</span>
        </p>

        <motion.div
          className="mx-auto mt-12 max-w-6xl px-4 md:px-6 lg:px-8"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <motion.div
              className="group relative"
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 p-1">
                <div className="relative h-64 overflow-hidden rounded-xl md:h-80 lg:h-96">
                  <Image
                    src="/media/marketing/landing-page.jpg"
                    alt="NCT Landing Page v2 Screenshot"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-purple-600/10"></div>
                </div>
              </div>
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-blue-500/20 to-purple-600/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"></div>
            </motion.div>

            <motion.div
              className="space-y-6"
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              <div>
                <h3 className="mb-4 text-2xl font-extrabold text-foreground md:text-3xl lg:text-4xl">
                  NCT <span className="text-[#5FC6E5]">Hub Platform</span>
                </h3>
                <p className="text-md leading-relaxed font-medium text-muted-foreground md:text-lg">
                  The official web-based platform for RMIT Neo Culture Tech
                  based on Tuturuuu, serving as both an informative digital
                  showcase for visitors and a comprehensive management platform
                  for core team members.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#F4B71A]"></div>
                  <p className="font-medium text-muted-foreground">
                    Interactive games and entertainment features including Neo
                    Chess, Neo Crush, with engaging experiences for all players
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#1AF4E6]"></div>
                  <p className="font-medium text-muted-foreground">
                    Practical utility applications like ID scanner, time
                    tracking tools, and various productivity enhancing features.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-3 h-2 w-2 flex-shrink-0 rounded-full bg-[#F4B71A]"></div>
                  <p className="font-medium text-muted-foreground">
                    Comprehensive workspace management system for organizing
                    projects, managing team members, and streamlining club
                    operations.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
