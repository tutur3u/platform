'use client';

import GradientHeadline from '../gradient-headline';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface RainingElement {
  id: number;
  content: string;
  color: string;
  initialX: number;
  targetY: number;
}

export default function MarketingPage() {
  const t = useTranslations();
  const [rainingElements, setRainingElements] = useState<RainingElement[]>([]);

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined';
    const windowWidth = isBrowser ? window.innerWidth : 1024; // Default for SSR
    const windowHeight = isBrowser ? window.innerHeight : 768; // Default for SSR

    const rainingElements: RainingElement[] = Array.from({ length: 50 }).map(
      (_, i) => ({
        id: i,
        content: i % 3 === 0 ? '✨' : i % 3 === 1 ? '🌟' : '❄️',
        color: i % 2 === 0 ? 'text-blue-400' : 'text-pink-400',
        initialX: Math.random() * windowWidth,
        targetY: Math.random() * windowHeight,
      })
    );

    setRainingElements(rainingElements);
  }, []);

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col items-center">
      {/* Raining Effect */}
      <div className="absolute inset-0 h-screen overflow-hidden">
        {rainingElements.map((element) => (
          <motion.div
            key={element.id}
            initial={{
              x: element.initialX,
              y: -50,
            }}
            animate={{
              y: [Math.random() * -200, element.targetY],
              opacity: [0, 1, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: Math.random() * 10 + 5,
              delay: Math.random() * 5,
            }}
            className={`absolute text-sm text-foreground ${element.color}`}
            style={{
              left: `${Math.random() * 100}%`,
              fontSize: `${Math.random() * 1.5 + 0.5}rem`,
            }}
          >
            {element.content}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-48"
      >
        <h1 className="text-center text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
          JOIN OUR PLAYGROUND
        </h1>
        <h2 className="text-gradient mt-4 text-center text-lg font-bold md:text-2xl lg:text-3xl">
          <GradientHeadline title={'Get ready for future, get used with AI'} />
        </h2>
        <p className="mt-4 text-center text-gray-400">
          Practice your prompt, use your prompt in real-world applications.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <GetStartedButton text={t('home.get-started')} />
        </div>
      </motion.div>
    </div>
  );
}
