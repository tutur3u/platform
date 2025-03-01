import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion, useAnimation } from 'framer-motion';
import { Bot, MessageSquare, Send, Sparkles, User } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function InteractiveDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const controls = useAnimation();

  const demoConversation = [
    {
      role: 'user' as const,
      content: 'Generate a creative story about a time-traveling scientist.',
    },
    {
      role: 'assistant' as const,
      content:
        "Here's a short story about Dr. Elena Chen, a quantum physicist who accidentally discovered time travel while researching particle entanglement...",
    },
    {
      role: 'user' as const,
      content: 'Make it more suspenseful and add a plot twist.',
    },
    {
      role: 'assistant' as const,
      content:
        'As Dr. Chen stepped through the quantum portal, she realized with horror that each "alternate timeline" she\'d visited was actually creating paradoxical copies of herself...',
    },
  ];

  useEffect(() => {
    if (currentStep < demoConversation.length) {
      const timer = setTimeout(() => {
        const newMessage = demoConversation[currentStep];
        if (newMessage) {
          setMessages((prev) => [...prev, newMessage]);
          setCurrentStep((prev) => prev + 1);
          controls.start({ opacity: 1, y: 0 });
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentStep, controls]);

  return (
    <div className="relative">
      {/* Decorative elements */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent)]" />

      <div className="relative mx-auto max-w-3xl">
        <Card className="overflow-hidden border-primary/10 bg-background/10 backdrop-blur-sm">
          {/* Demo header */}
          <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 p-4">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold">Interactive AI Demo</span>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              <Sparkles className="h-3 w-3" />
              Live Preview
            </span>
          </div>

          {/* Messages container */}
          <div className="h-[400px] space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex items-start gap-3 ${
                  message.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                }`}
              >
                <div
                  className={`rounded-full p-2 ${
                    message.role === 'assistant'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`max-w-[80%] rounded-lg ${
                    message.role === 'assistant'
                      ? 'bg-muted'
                      : 'bg-primary text-primary-foreground'
                  } p-3`}
                >
                  <p className="text-sm">{message.content}</p>
                </motion.div>
              </motion.div>
            ))}
            {currentStep < demoConversation.length && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                  }}
                  className="h-2 w-2 rounded-full bg-primary"
                />
                <span className="text-sm">AI is typing...</span>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="flex items-center gap-2 border-t border-primary/10 bg-background/10 p-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Type your message..."
                className="w-full rounded-lg border border-primary/10 bg-background/10 px-4 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none"
                disabled
              />
              <MessageSquare className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button size="icon" disabled>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
