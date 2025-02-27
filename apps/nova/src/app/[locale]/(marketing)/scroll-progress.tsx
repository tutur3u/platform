import { motion, useScroll, useSpring } from 'framer-motion';

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <>
      <motion.div
        className="fixed top-0 right-0 left-0 z-50 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
        style={{ scaleX, transformOrigin: '0%' }}
      />
      <motion.div
        className="fixed top-0 right-0 left-0 z-40 h-1 bg-primary/10"
        style={{ opacity: scrollYProgress }}
      />
    </>
  );
}
