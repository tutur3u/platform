import InteractiveDemo from './interactive-demo';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  LineChart,
  Lock,
  MessageSquareCode,
  Settings2,
  ShieldCheck,
  Wand2,
} from 'lucide-react';

const features = [
  {
    icon: <BrainCircuit className="h-5 w-5" />,
    title: 'Advanced AI Models',
    description: 'Access GPT-4, Claude, and other cutting-edge AI models',
  },
  {
    icon: <MessageSquareCode className="h-5 w-5" />,
    title: 'Smart Templating',
    description: 'Create and share reusable prompt templates',
  },
  {
    icon: <LineChart className="h-5 w-5" />,
    title: 'Performance Analytics',
    description: 'Track and optimize your prompt effectiveness',
  },
  {
    icon: <Settings2 className="h-5 w-5" />,
    title: 'Fine-tuning Controls',
    description: 'Adjust parameters for perfect outputs',
  },
  {
    icon: <Lock className="h-5 w-5" />,
    title: 'Secure Processing',
    description: 'Enterprise-grade security for your data',
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Ethical AI Usage',
    description: 'Built-in bias detection and ethical guidelines',
  },
];

export default function AiFeatures() {
  return (
    <section id="ai" className="relative w-full py-24">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-gradient-to-b from-foreground/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(var(--primary-rgb),0.1),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4">
        <div className="mb-16 text-center">
          <Badge
            variant="outline"
            className="mb-4 inline-flex items-center gap-1 border-foreground/10"
          >
            <Bot className="h-4 w-4" />
            AI Capabilities
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Powered by Advanced AI Technology
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Experience the next generation of prompt engineering with our
            cutting-edge AI features and tools
          </p>
        </div>

        <div className="mb-16 grid gap-8 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="group relative overflow-hidden border-foreground/10 bg-foreground/10 transition-colors hover:border-foreground/30">
                    <div className="relative z-10 p-6">
                      <div className="mb-3 w-fit rounded-full bg-foreground/10 p-2 text-foreground">
                        {feature.icon}
                      </div>
                      <h3 className="mb-1 font-semibold">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>

                    {/* Decorative gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative min-h-[600px]"
          >
            <InteractiveDemo />

            {/* Decorative elements */}
            <motion.div
              className="absolute -top-12 -right-12 h-24 w-24"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 90, 0],
              }}
              transition={{ duration: 20, repeat: Infinity }}
            >
              <div className="h-full w-full rounded-full bg-foreground/10 blur-3xl" />
            </motion.div>

            <motion.div
              className="absolute -bottom-8 -left-8 h-32 w-32"
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, -90, 0],
              }}
              transition={{ duration: 15, repeat: Infinity }}
            >
              <div className="h-full w-full rounded-full bg-foreground/5 blur-3xl" />
            </motion.div>
          </motion.div>
        </div>

        {/* Feature highlight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-xl border border-foreground/10 bg-foreground/5 p-8 backdrop-blur-sm"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-foreground/10 p-3 text-foreground">
              <Wand2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Magic Commands</h3>
              <p className="text-muted-foreground">
                Use special commands to quickly generate optimized prompts for
                different use cases
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            {[
              '/story "Generate a creative story about..."',
              '/analyze "Analyze this text for sentiment..."',
              '/improve "Make this text more engaging..."',
            ].map((command, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="rounded-lg border border-foreground/10 bg-foreground/5 p-3 font-mono"
              >
                {command}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
