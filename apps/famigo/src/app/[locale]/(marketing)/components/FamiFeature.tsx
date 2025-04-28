'use client';

import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import React from 'react';

interface FamiFeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: string; // Added color prop for customization
}

const FamiFeature = ({
  icon,
  title,
  description,
  color = 'primary',
}: FamiFeatureProps) => {
  // Get color classes based on the color prop
  const getColorClasses = () => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
      case 'purple':
        return 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/10 text-pink-500 dark:bg-pink-500/20 dark:text-pink-400';
      case 'orange':
        return 'bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400';
      case 'green':
        return 'bg-green-500/10 text-green-500 dark:bg-green-500/20 dark:text-green-400';
      default:
        return 'bg-primary/10 text-primary dark:bg-primary/20';
    }
  };

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            type: 'spring',
            stiffness: 100,
            damping: 15,
          },
        },
        hover: {
          scale: 1.03,
          y: -5,
          transition: {
            type: 'spring',
            stiffness: 400,
            damping: 10,
          },
        },
      }}
      whileHover="hover"
      className="group"
    >
      <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 backdrop-blur-sm dark:border-foreground/5 dark:bg-foreground/10">
        <div className="relative overflow-hidden rounded-xl p-6">
          {/* Animated gradient background on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-background/20 via-foreground/5 to-background opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>

          <div className="relative">
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${getColorClasses()}`}
            >
              {icon}
            </div>
            <h3 className="mb-2 text-xl font-bold">{title}</h3>
            <p className="text-muted-foreground">{description}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default FamiFeature;
