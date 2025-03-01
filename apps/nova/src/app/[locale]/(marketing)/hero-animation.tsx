import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

export default function HeroAnimation() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  // Generate particles once and memoize them
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }).map(() => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: Math.random() * 2,
        duration: Math.random() * 3 + 2,
      })),
    []
  );

  useEffect(() => {
    const updatePosition = () => {
      const newX = (Math.random() - 0.5) * window.innerWidth * 0.8;
      const newY = (Math.random() - 0.5) * window.innerHeight * 0.8;
      const newRotation = Math.random() * 360;

      setPosition({ x: newX, y: newY });
      setRotation(newRotation);
    };

    updatePosition();
    const interval = setInterval(updatePosition, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 h-screen overflow-hidden">
      {/* Main gradient blob group */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={{
          rotate: rotation,
        }}
        transition={{
          type: 'spring',
          stiffness: 10,
          damping: 20,
          duration: 3,
        }}
      >
        {/* Largest blob with rainbow gradient - More harmonious light mode colors */}
        <motion.div
          className="pointer-events-none absolute h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,#93C5FD,#C084FC,#F472B6,#FB923C,#4ADE80,#22D3EE,#60A5FA,#93C5FD)] opacity-25 blur-[100px] dark:bg-[conic-gradient(from_0deg,#FF80AB,#FFB74D,#FFE57F,#AED581,#4DD0E1,#82B1FF,#B388FF,#FF80AB)] dark:opacity-30"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, -180],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.5, 1],
          }}
        />

        {/* Colored blobs with different animations - Refined gradients */}
        <motion.div
          className="pointer-events-none absolute h-[600px] w-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-gradient-to-r from-violet-400/20 via-purple-400/20 to-fuchsia-400/20 blur-3xl dark:from-fuchsia-400/30 dark:via-rose-400/30 dark:to-purple-400/30"
          animate={{
            x: position.x - 200,
            y: position.y - 200,
            scale: [1, 1.1, 1],
          }}
          transition={{
            x: {
              type: 'spring',
              stiffness: 20,
              damping: 30,
              duration: 4,
            },
            y: {
              type: 'spring',
              stiffness: 20,
              damping: 30,
              duration: 4,
            },
            scale: {
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.5, 1],
            },
          }}
        />

        <motion.div
          className="pointer-events-none absolute h-[500px] w-[500px] translate-x-1/4 translate-y-1/4 rounded-full bg-gradient-to-r from-emerald-400/20 via-teal-400/20 to-cyan-400/20 blur-3xl dark:from-cyan-400/20 dark:via-teal-400/20 dark:to-emerald-400/20"
          animate={{
            x: position.x * -0.8,
            y: position.y * -0.8,
            scale: [1, 1.2, 1],
          }}
          transition={{
            x: {
              type: 'spring',
              stiffness: 15,
              damping: 25,
              duration: 4,
            },
            y: {
              type: 'spring',
              stiffness: 15,
              damping: 25,
              duration: 4,
            },
            scale: {
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.5, 1],
            },
          }}
        />

        <motion.div
          className="pointer-events-none absolute h-[400px] w-[400px] -translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-r from-blue-400/20 via-indigo-400/20 to-violet-400/20 blur-3xl dark:from-violet-400/30 dark:via-indigo-400/30 dark:to-blue-400/30"
          animate={{
            x: position.x * 0.6,
            y: position.y * 0.6,
            scale: [1, 1.3, 1],
          }}
          transition={{
            x: {
              type: 'spring',
              stiffness: 25,
              damping: 35,
              duration: 4,
            },
            y: {
              type: 'spring',
              stiffness: 25,
              damping: 35,
              duration: 4,
            },
            scale: {
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.5, 1],
            },
          }}
        />
      </motion.div>

      {/* Floating particles - Refined appearance */}
      <div className="absolute inset-0">
        {particles.map((particle, i) => (
          <motion.div
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-indigo-300/20 backdrop-blur-sm dark:bg-white/30"
            style={{
              left: particle.left,
              top: particle.top,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 1, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      {/* Grid pattern - More refined light mode */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:14px_14px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)]" />

      {/* Enhanced radial gradient overlay - Refined light mode */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_1000px_at_50%_-30%,rgba(99,102,241,0.06),transparent_70%)] dark:bg-[radial-gradient(circle_1000px_at_50%_-30%,rgba(255,255,255,0.05),transparent_70%)]" />
    </div>
  );
}
