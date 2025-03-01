import { Card } from '@tuturuuu/ui/card';
import { motion, useAnimation } from 'framer-motion';
import {
  Brain,
  Code2,
  Command,
  Flame,
  LineChart,
  MessageSquareCode,
  Sparkles,
  Users,
} from 'lucide-react';
import { ReactNode, useEffect } from 'react';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
  gradient: string;
}

export default function FeatureShowcase() {
  const features: Feature[] = [
    {
      icon: <Brain className="h-6 w-6" />,
      title: 'Advanced AI Models',
      description:
        'Access cutting-edge AI models for powerful prompt engineering',
      gradient: 'from-purple-500/20 via-primary/20 to-blue-500/20',
    },
    {
      icon: <Code2 className="h-6 w-6" />,
      title: 'Real-time Testing',
      description: 'Test and iterate your prompts with instant feedback',
      gradient: 'from-emerald-500/20 via-primary/20 to-teal-500/20',
    },
    {
      icon: <LineChart className="h-6 w-6" />,
      title: 'Performance Analytics',
      description: 'Track and optimize your prompt engineering efforts',
      gradient: 'from-blue-500/20 via-primary/20 to-indigo-500/20',
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: 'Collaborative Learning',
      description: 'Learn from and share with the community',
      gradient: 'from-pink-500/20 via-primary/20 to-rose-500/20',
    },
    {
      icon: <Command className="h-6 w-6" />,
      title: 'Advanced Controls',
      description: 'Fine-tune every aspect of your prompts',
      gradient: 'from-amber-500/20 via-primary/20 to-orange-500/20',
    },
    {
      icon: <MessageSquareCode className="h-6 w-6" />,
      title: 'Smart Templates',
      description: 'Start with optimized prompt templates',
      gradient: 'from-cyan-500/20 via-primary/20 to-sky-500/20',
    },
    {
      icon: <Flame className="h-6 w-6" />,
      title: 'Performance Mode',
      description: 'Optimize for speed and efficiency',
      gradient: 'from-red-500/20 via-primary/20 to-orange-500/20',
    },
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: 'AI Assistant',
      description: 'Get help from our AI prompt expert',
      gradient: 'from-violet-500/20 via-primary/20 to-purple-500/20',
    },
  ];

  const controls = useAnimation();

  useEffect(() => {
    controls.start((i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1 },
    }));
  }, [controls]);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((feature, index) => (
        <motion.div
          key={index}
          custom={index}
          initial={{ opacity: 0, y: 20 }}
          animate={controls}
          whileHover={{ scale: 1.02 }}
          className="group"
        >
          <Card className="relative h-full overflow-hidden border-primary/10 bg-foreground/10">
            <div className="relative z-10 flex h-full flex-col space-y-4 p-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  {feature.icon}
                </div>
              </div>
              <h3 className="text-xl font-bold">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>

            {/* Animated gradient background */}
            <motion.div
              className={`absolute inset-0 -z-10 bg-gradient-to-br ${feature.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100`}
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 5, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
