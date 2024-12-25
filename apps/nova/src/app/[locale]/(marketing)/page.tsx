'use client';

import { motion } from 'framer-motion';
import GradientHeadline from '../gradient-headline';
import GetStartedButton from '../get-started-button';

function MarketingPage() {
  // Make sure to only access `window` in the browser
  const isBrowser = typeof window !== 'undefined';

  const rainingElements = Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    content: i % 3 === 0 ? '✨' : i % 3 === 1 ? '🤖' : '🚀',
    color: i % 2 === 0 ? 'text-blue-400' : 'text-pink-400',
  }));

  return (
    <div className="relative flex w-full flex-col items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="from-deep-blue via-midnight-blue to-dark-purple relative min-h-[calc(100vh-3.5rem)] w-full bg-gradient-to-b"
      >
        {/* Raining Effect */}
        <div className="absolute inset-0 overflow-hidden">
          {rainingElements.map((element) => (
            <motion.div
              key={element.id}
              initial={{
                x: isBrowser ? Math.random() * window.innerWidth : 0, // Only use `window` in the browser
                y: -50,
              }}
              animate={{
                y: [Math.random() * -200, Math.random() * (isBrowser ? window.innerHeight : 500)],
                opacity: [0, 1, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: Math.random() * 10 + 5,
                delay: Math.random() * 5,
              }}
              className="absolute text-white text-opacity-50 text-sm"
              style={{
                left: `${Math.random() * 100}%`, 
                fontSize: `${Math.random() * 1.5 + 0.5}rem`,
              }}
            >
              {element.content}
            </motion.div>
          ))}
        </div>

        <div className="relative mx-auto pt-[250px] flex max-w-6xl flex-col items-center justify-center px-4 py-48">
          <h1 className="text-white text-center text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            JOIN OUR PLAYGROUND
          </h1>
          <h2 className="text-center text-lg md:text-2xl lg:text-3xl font-bold text-gradient mt-4">
            <GradientHeadline title={'Get ready for future, get used with AI'} />
          </h2>
          <p className="text-gray-400 text-center mt-4">
            Practice your prompt, use your prompt in real-world applications.
          </p>

          <div className="flex flex-col items-center gap-4 mt-8 sm:flex-row sm:justify-center">
            <input
              type="text"
              placeholder="Enter your prompts"
              className="rounded-md border border-gray-300 bg-gray-900 text-white px-4 py-2 w-72 sm:w-80 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <GetStartedButton href="/login" />
          </div>
        </div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-x-0 bottom-24 flex w-full flex-col items-center"
        >
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <span className="text-sm"></span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              ↓
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default MarketingPage;
