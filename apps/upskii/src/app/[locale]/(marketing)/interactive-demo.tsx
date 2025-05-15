'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Bot, MessageSquare, Send, Sparkles, User } from '@tuturuuu/ui/icons';
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

export default function InteractiveDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const controls = useAnimation();
  const t = useTranslations('nova.interactive-demo');

  const demoConversation: Message[] = [
    {
      role: 'user',
      content: 'input1',
    },
    {
      role: 'assistant',
      content: 'response1',
    },
    {
      role: 'user',
      content: 'input2',
    },
    {
      role: 'assistant',
      content: 'response2',
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
      <div className="from-primary/5 absolute inset-0 rounded-xl bg-linear-to-b via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent)]" />

      <div className="relative mx-auto max-w-3xl">
        <Card className="border-primary/10 bg-background/10 overflow-hidden backdrop-blur-sm">
          {/* Demo header */}
          <div className="border-primary/10 bg-primary/5 flex items-center gap-2 border-b p-4">
            <Bot className="text-primary h-5 w-5" />
            <span className="font-semibold">{t('title')}</span>
            <span className="bg-primary/10 text-primary ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs">
              <Sparkles className="h-3 w-3" />
              {t('badge')}
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
                  <p className="text-sm">{t(message.content)}</p>
                </motion.div>
              </motion.div>
            ))}
            {currentStep < demoConversation.length && (
              <div className="text-muted-foreground flex items-center gap-2">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                  }}
                  className="bg-primary h-2 w-2 rounded-full"
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
          <div className="border-primary/10 bg-background/10 flex items-center gap-2 border-t p-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={t('input-place-holder')}
                className="border-primary/10 bg-background/10 placeholder:text-muted-foreground focus:ring-primary/20 w-full rounded-lg border px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2"
                disabled
              />
              <MessageSquare className="text-muted-foreground absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
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
