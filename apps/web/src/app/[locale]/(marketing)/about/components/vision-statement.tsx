'use client';

import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

export function VisionStatement() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative text-center"
    >
      {/* Enhanced background effects */}
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
          className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
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
            <Quote className="text-primary h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
          </motion.div>
        </motion.div>

        <motion.div
          className="bg-foreground/5 group relative mx-auto max-w-4xl overflow-hidden rounded-2xl p-8 backdrop-blur-sm md:p-12"
          whileHover={{ scale: 1.02 }}
        >
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
          <motion.div
            animate={{
              rotate: [0, 360],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute -bottom-8 -left-8 h-24 w-24 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
          />

          <blockquote className="pointer-events-none relative">
            <div className="text-primary/20 absolute -top-4 -left-4">
              <Quote className="h-8 w-8 rotate-180" />
            </div>
            <div className="text-primary/20 absolute -right-4 -bottom-4">
              <Quote className="h-8 w-8" />
            </div>

            <motion.p
              className="text-foreground relative text-2xl leading-relaxed font-medium italic md:text-3xl"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              &quot;In a world where technology often creates barriers,
              we&apos;re breaking them down. Our vision isn&apos;t just about
              building better software—it&apos;s about creating a future where
              groundbreaking technology is accessible to all. Every line of code
              we write, every solution we develop, is a step toward this future.
              This isn&apos;t just our mission; it&apos;s our unwavering
              commitment to humanity.&quot;
            </motion.p>

            <motion.footer
              className="text-foreground/60 mt-8 text-lg"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <motion.span
                className="from-primary bg-gradient-to-r via-blue-500 to-cyan-500 bg-clip-text font-semibold text-transparent"
                whileHover={{ scale: 1.05 }}
              >
                — Vo Hoang Phuc
              </motion.span>
              <br />
              <motion.span
                className="text-foreground/40 text-sm"
                whileHover={{ scale: 1.05 }}
              >
                Founder & CEO, Tuturuuu
              </motion.span>
            </motion.footer>
          </blockquote>

          <motion.div
            initial={{ scaleX: 0 }}
            whileHover={{ scaleX: 1 }}
            transition={{ duration: 0.3 }}
            className="from-primary/20 to-primary/5 absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r"
          />
        </motion.div>
      </div>
    </motion.section>
  );
}
