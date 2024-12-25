'use client';

import GetStartedButton from '../get-started-button';
import GradientHeadline from '../gradient-headline';
import { motion } from 'framer-motion';

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
                y: [
                  Math.random() * -200,
                  Math.random() * (isBrowser ? window.innerHeight : 500),
                ],
                opacity: [0, 1, 0],
              }}
              transition={{
                repeat: Infinity,
                duration: Math.random() * 10 + 5,
                delay: Math.random() * 5,
              }}
              className="absolute text-sm text-white text-opacity-50"
              style={{
                left: `${Math.random() * 100}%`,
                fontSize: `${Math.random() * 1.5 + 0.5}rem`,
              }}
            >
              {element.content}
            </motion.div>
          ))}
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-48 pt-[250px]">
          <h1 className="text-center text-4xl font-bold tracking-tight text-white md:text-6xl lg:text-7xl">
            JOIN OUR PLAYGROUND
          </h1>
          <h2 className="text-gradient mt-4 text-center text-lg font-bold md:text-2xl lg:text-3xl">
            <GradientHeadline
              title={'Get ready for future, get used with AI'}
            />
          </h2>
          <p className="mt-4 text-center text-gray-400">
            Practice your prompt, use your prompt in real-world applications.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <div className="relative">
              <input
                className="ease placeholder:text-white-400 hover:border-white-300 peer rounded-xl border border-slate-200 bg-white bg-opacity-20 px-4 py-2 text-white shadow-sm backdrop-blur-lg transition duration-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-80"
              />
              <label className="absolute left-2.5 top-2.5 origin-left transform cursor-text px-1 text-sm text-white transition-all peer-focus:-top-2 peer-focus:left-2.5 peer-focus:scale-90 peer-focus:text-xs peer-focus:text-white">
                Prompt here..
              </label>
            </div>

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
