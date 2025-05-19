import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Image from 'next/image';
import { useRef, useState } from 'react';

export const Floating3DLogo = () => {
  const logoRef = useRef<HTMLDivElement>(null);
  const [, setMousePosition] = useState({ x: 0, y: 0 });
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-100, 100], [30, -30]));
  const rotateY = useSpring(useTransform(mouseX, [-100, 100], [-30, 30]));

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!logoRef.current) return;
    const rect = logoRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setMousePosition({ x, y });
    mouseX.set(x);
    mouseY.set(y);
  };

  return (
    <motion.div
      ref={logoRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
      style={{ perspective: 1000 }}
      className="group relative mb-12 h-fit w-fit"
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative"
      >
        <div className="bg-linear-to-br from-primary/20 absolute inset-0 -z-10 rounded-full via-transparent to-transparent opacity-50 blur-lg transition-all duration-300 group-hover:opacity-100" />
        <Image
          src="/media/logos/transparent.png"
          width={200}
          height={200}
          alt="Tuturuuu Logo"
          priority
          className="relative transition-all duration-300 group-hover:scale-110 group-hover:brightness-110"
        />
      </motion.div>
    </motion.div>
  );
};
