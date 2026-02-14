import { Bot, MessageSquare, Send, Sparkles, User } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion, useAnimation } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type DemoMessageKey =
  | 'title'
  | 'badge'
  | 'input1'
  | 'response1'
  | 'input2'
  | 'response2';

interface Message {
  role: 'user' | 'assistant';
  content: DemoMessageKey;
}

const demoConversation: Message[] = [
  { role: 'user', content: 'input1' },
  { role: 'assistant', content: 'response1' },
  { role: 'user', content: 'input2' },
  { role: 'assistant', content: 'response2' },
];

export default function InteractiveDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const controls = useAnimation();
  const t = useTranslations('nova.interactive-demo');

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
      <div className="absolute inset-0 rounded-xl bg-linear-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent)]" />

      <div className="relative mx-auto max-w-3xl">
        <Card className="overflow-hidden border-primary/10 bg-background/10 backdrop-blur-sm">
          {/* Demo header */}
          <div className="flex items-center gap-2 border-primary/10 border-b bg-primary/5 p-4">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold">{t('title')}</span>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary text-xs">
              <Sparkles className="h-3 w-3" />
              {t('badge')}
            </span>
          </div>

          {/* Messages container */}
          <div className="h-100 space-y-4 overflow-y-auto p-4">
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
                  <p className="text-sm">{t(message.content)}</p>
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
                <span className="text-sm">
                  {demoConversation[currentStep]?.role === 'assistant'
                    ? t('ai-typing')
                    : t('user-typing')}
                </span>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="flex items-center gap-2 border-primary/10 border-t bg-background/10 p-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t('input-place-holder')}
                className="w-full rounded-lg border border-primary/10 bg-background/10 px-4 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
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
