'use client';

import GetStartedButton from './get-started-button';
import { motion } from 'framer-motion';

export default function WhatIsNeo() {
  return (
    <motion.div
      className="mt-4 flex flex-col items-center text-center md:mt-28"
      initial={{ opacity: 0, y: 50 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <p className="text-4xl font-extrabold leading-normal md:text-5xl lg:text-6xl">
        What is{' '}
        <span className="whitespace-nowrap border-b-4 border-[#FBC721] text-[#5FC6E5]">
          NEO Culture
        </span>{' '}
        Tech?
      </p>
      <div className="mb-2 lg:w-2/3">
        <p className="mt-6 text-lg font-semibold tracking-wide md:text-xl lg:mt-10 lg:text-3xl">
          Founded in 2019, we are the best club for
          <span className="text-[#5FC6E5]"> SSET students </span>
          to explore the world of technology at RMIT University.
        </p>
      </div>
      <div className="my-8 flex w-full justify-center gap-12 md:gap-24">
        {[
          { number: '100+', content: 'Active Members' },
          { number: '70+', content: 'Student Projects' },
          { number: '50+', content: 'Industry Partners' },
        ].map((item, index) => (
          <div key={index} className="text-center">
            <p className="text-3xl font-extrabold text-[#FBC721] md:text-5xl lg:text-7xl">
              {item.number}
            </p>
            <p className="mt-2 text-xl font-medium lg:mt-4 lg:text-3xl">
              {item.content.split(' ').map((word, i) => (
                <span key={i} className="block">
                  {word}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      <GetStartedButton href="/login" />
    </motion.div>
  );
}
