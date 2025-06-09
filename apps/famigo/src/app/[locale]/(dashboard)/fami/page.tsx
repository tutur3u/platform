'use client';

import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  BrainCircuit,
  RefreshCw,
  Send,
  Sparkles,
  UserCircle,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function FamiPage() {
  const [messages, setMessages] = useState<
    {
      role: 'fami' | 'user';
      content: string;
      timestamp: string;
    }[]
  >([
    {
      role: 'fami',
      content:
        "Hello! I'm Fami, your family AI mediator. How can I help you today?",
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    // Add user message
    const userMessage = {
      role: 'user',
      content: newMessage,
      timestamp: new Date().toISOString(),
    } as const;

    setMessages((prev) => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);

    // Simulate Fami response after a delay
    setTimeout(() => {
      const famiResponses = [
        'I understand that communicating with your parents about your career choice can be challenging. Would you like me to help draft a message that respects their perspective while expressing your passion?',
        "It sounds like there might be a misunderstanding between you and your sister. Sometimes differences in communication styles can make things difficult. Let's think about how to approach this conversation.",
        "Having different expectations about family time is common. I can help you find a middle ground that respects everyone's needs and schedules.",
        'I hear your concern about connecting with your teenager. This is a common challenge. Would you like suggestions for conversation starters that might help bridge the gap?',
      ];

      const randomResponse =
        famiResponses[Math.floor(Math.random() * famiResponses.length)]!;

      const famiMessage = {
        role: 'fami' as const,
        content: randomResponse,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, famiMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="container mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col gap-4 px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-r from-purple-500/80 to-blue-500/80">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fami</h1>
            <p className="text-sm text-muted-foreground">
              Your AI Communication Mediator
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400"
        >
          <Sparkles className="mr-1 h-3 w-3" /> Active
        </Badge>
      </div>

      <Card className="relative flex flex-1 flex-col overflow-hidden border-foreground/10 bg-background/60 backdrop-blur-sm dark:border-foreground/5">
        {/* Decorative elements */}
        <div className="absolute -top-20 -left-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"></div>
        <div className="absolute -right-20 -bottom-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>

        <ScrollArea className="relative flex-1 p-4">
          <div className="flex flex-col gap-4">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex max-w-[80%] gap-3 rounded-2xl p-4 ${
                    message.role === 'user'
                      ? 'bg-linear-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20'
                      : 'bg-linear-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-500/20 dark:to-blue-500/20'
                  }`}
                >
                  {message.role === 'fami' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-linear-to-r from-purple-500 to-blue-500 text-white">
                        F
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {message.role === 'fami' ? 'Fami' : 'You'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{message.content}</p>
                  </div>
                  {message.role === 'user' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-linear-to-r from-blue-500 to-purple-500 text-white">
                        Y
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex max-w-[80%] gap-3 rounded-2xl bg-linear-to-r from-purple-500/10 to-blue-500/10 p-4 dark:from-purple-500/20 dark:to-blue-500/20">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-linear-to-r from-purple-500 to-blue-500 text-white">
                      F
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin text-purple-500" />
                    <span className="text-sm">Fami is thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        <Separator className="bg-foreground/5" />

        <div className="flex items-end gap-2 p-4">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message to Fami..."
            className="min-h-[60px] resize-none border-foreground/10 bg-background/60 dark:border-foreground/5"
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            className="h-10 w-10 rounded-full bg-linear-to-r from-purple-600 to-blue-600 dark:from-purple-500 dark:to-blue-500"
          >
            <Send className="h-4 w-4 text-white" />
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="col-span-2 overflow-hidden border-foreground/10 bg-background/60 dark:border-foreground/5">
          <div className="bg-linear-to-r from-blue-500/10 to-purple-500/10 p-4 dark:from-blue-500/20 dark:to-purple-500/20">
            <h3 className="text-sm font-medium">Conversation Privacy</h3>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">
              Your conversations with Fami are private. You control what gets
              shared with family members. Use Fami to help craft messages or
              mediate difficult conversations.
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden border-foreground/10 bg-background/60 dark:border-foreground/5">
          <div className="bg-linear-to-r from-purple-500/10 to-pink-500/10 p-4 dark:from-purple-500/20 dark:to-pink-500/20">
            <h3 className="text-sm font-medium">Communicate With</h3>
          </div>
          <div className="flex gap-2 p-4">
            <Avatar className="cursor-pointer border-2 border-transparent hover:border-purple-500">
              <AvatarFallback className="bg-blue-500/20 text-blue-600">
                D
              </AvatarFallback>
            </Avatar>
            <Avatar className="cursor-pointer border-2 border-transparent hover:border-purple-500">
              <AvatarFallback className="bg-green-500/20 text-green-600">
                L
              </AvatarFallback>
            </Avatar>
            <Avatar className="cursor-pointer border-2 border-transparent hover:border-purple-500">
              <AvatarFallback className="bg-pink-500/20 text-pink-600">
                S
              </AvatarFallback>
            </Avatar>
          </div>
        </Card>

        <Card className="overflow-hidden border-foreground/10 bg-background/60 dark:border-foreground/5">
          <div className="bg-linear-to-r from-pink-500/10 to-orange-500/10 p-4 dark:from-pink-500/20 dark:to-orange-500/20">
            <h3 className="text-sm font-medium">Save Templates</h3>
          </div>
          <div className="p-4">
            <Button size="sm" variant="outline" className="w-full text-xs">
              <UserCircle className="mr-1 h-3 w-3" /> My Templates
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
