import { motion } from 'framer-motion';
import { Circle, Square, Triangle } from 'lucide-react';
import { useEffect, useState } from 'react';

const FloatingElements = () => {
  const [elements, setElements] = useState<
    Array<{
      id: number;
      x: number;
      y: number;
      rotation: number;
      scale: number;
      color: string;
    }>
  >([]);

  useEffect(() => {
    const generateElements = () => {
      const newElements = [];
      const colors = ['#FF5757', '#FFD93D', '#6BCB77', '#4D96FF'];

      for (let i = 0; i < 15; i++) {
        newElements.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          rotation: Math.random() * 360,
          scale: 0.5 + Math.random() * 0.5,
          color: colors[Math.floor(Math.random() * colors.length)]!,
        });
      }

      setElements(newElements);
    };

    generateElements();
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {elements.map((element) => (
        <motion.div
          key={element.id}
          className="absolute"
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            color: element.color,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, -10, 0],
            rotate: [0, element.rotation],
            scale: [element.scale, element.scale * 1.2, element.scale],
          }}
          transition={{
            duration: 5 + Math.random() * 5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {element.id % 3 === 0 ? (
            <Circle className="h-4 w-4 opacity-20" />
          ) : element.id % 3 === 1 ? (
            <Square className="h-4 w-4 opacity-20" />
          ) : (
            <Triangle className="h-4 w-4 opacity-20" />
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default FloatingElements;
