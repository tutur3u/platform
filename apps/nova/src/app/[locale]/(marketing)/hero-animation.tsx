import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

export default function HeroAnimation() {
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reduce particle count and complexity for mobile
  const particleCount = useMemo(() => (isMobile ? 10 : 25), [isMobile]);

  // Generate particles once and memoize them
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }).map(() => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: Math.random() * 2,
        duration: Math.random() * 2 + 2,
      })),
    [particleCount]
  );

  return (
    <div className="pointer-events-none fixed inset-0 h-screen w-screen overflow-hidden">
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 will-change-transform"
        animate={{
          rotate: [0, 360]
        }}
        transition={{
          duration: 60, // Even faster base rotation
          repeat: Infinity,
          ease: "linear"
        }}
      >
        {/* Main rainbow gradient blob with original colors but more dramatic motion */}
        <motion.div
          className="pointer-events-none absolute h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,#93C5FD,#C084FC,#F472B6,#FB923C,#4ADE80,#22D3EE,#60A5FA,#93C5FD)] opacity-20 blur-[60px] will-change-transform md:h-[800px] md:w-[800px] md:opacity-25 md:blur-[80px] dark:bg-[conic-gradient(from_0deg,#FF80AB,#FFB74D,#FFE57F,#AED581,#4DD0E1,#82B1FF,#B388FF,#FF80AB)] dark:opacity-30"
          animate={{
            scale: isMobile ? [1, 1.2, 0.8, 1] : [1, 1.3, 0.7, 1],
            rotate: [0, -360],
          }}
          transition={{
            duration: 30, // Faster rotation
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Secondary blobs with original colors and more dramatic motion */}
        <motion.div
          className="pointer-events-none absolute h-[400px] w-[400px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-gradient-to-r from-violet-400/20 via-purple-400/20 to-fuchsia-400/20 blur-xl will-change-transform md:h-[600px] md:w-[600px] md:blur-2xl dark:from-fuchsia-400/30 dark:via-rose-400/30 dark:to-purple-400/30"
          animate={{
            x: [0, 250, -250, 0], // More extreme x movement
            y: [0, -250, 250, 0], // More extreme y movement
            scale: isMobile ? [1, 1.3, 0.7, 1] : [1, 1.4, 0.6, 1],
            rotate: [0, 180, -180, 0],
          }}
          transition={{
            duration: 25, // Faster movement
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="pointer-events-none absolute h-[300px] w-[300px] translate-x-1/4 translate-y-1/4 rounded-full bg-gradient-to-r from-emerald-400/20 via-teal-400/20 to-cyan-400/20 blur-xl will-change-transform md:h-[500px] md:w-[500px] md:blur-2xl dark:from-cyan-400/20 dark:via-teal-400/20 dark:to-emerald-400/20"
          animate={{
            x: [0, -300, 300, 0], // More extreme x movement
            y: [0, 300, -300, 0], // More extreme y movement
            scale: isMobile ? [1, 1.4, 0.6, 1] : [1, 1.5, 0.5, 1],
            rotate: [0, -240, 240, 0],
          }}
          transition={{
            duration: 20, // Even faster movement
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="pointer-events-none absolute h-[250px] w-[250px] -translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-r from-blue-400/20 via-indigo-400/20 to-violet-400/20 blur-xl will-change-transform md:h-[400px] md:w-[400px] md:blur-2xl dark:from-violet-400/30 dark:via-indigo-400/30 dark:to-blue-400/30"
          animate={{
            x: [0, 200, -200, 0],
            y: [0, -200, 200, 0],
            scale: isMobile ? [1, 1.5, 0.5, 1] : [1, 1.6, 0.4, 1],
            rotate: [0, 360, -360, 0],
          }}
          transition={{
            duration: 15, // Fastest movement
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* Enhanced floating particles with more dramatic motion */}
      <div className="absolute inset-0">
        {particles.map((particle, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-indigo-300/20 will-change-transform md:h-1.5 md:w-1.5 dark:bg-white/30"
            style={{
              left: particle.left,
              top: particle.top,
            }}
            animate={{
              y: isMobile ? [0, -25, 0] : [0, -40, 0],
              opacity: [0.2, 1, 0.2],
              scale: isMobile ? [1, 1.5, 1] : [1, 2, 1],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:24px_24px] md:bg-[size:14px_14px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)]" />

      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_50%_-30%,rgba(99,102,241,0.04),transparent_70%)] md:bg-[radial-gradient(circle_800px_at_50%_-30%,rgba(99,102,241,0.05),transparent_70%)] dark:bg-[radial-gradient(circle_600px_at_50%_-30%,rgba(255,255,255,0.02),transparent_70%)] md:dark:bg-[radial-gradient(circle_800px_at_50%_-30%,rgba(255,255,255,0.03),transparent_70%)]" />
    </div>
  );
}
