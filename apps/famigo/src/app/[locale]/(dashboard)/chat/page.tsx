'use client';

import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Calendar,
  Image,
  MessageCircle,
  Paperclip,
  Pencil,
  Send,
  Video,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function ChatPage() {
  const familyMembers = [
    { id: 1, name: 'Duc (Dad)', initial: 'D', color: 'blue' },
    { id: 2, name: 'Linh (Mom)', initial: 'L', color: 'green' },
    { id: 3, name: 'Minh (Son)', initial: 'M', color: 'purple' },
    { id: 4, name: 'Suong (Daughter)', initial: 'S', color: 'pink' },
  ];

  const [messages, setMessages] = useState([
    {
      id: 1,
      senderId: 1,
      content: "I'm going to be home late tonight, work meeting ran over",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      mood: 'tired',
    },
    {
      id: 2,
      senderId: 2,
      content:
        "That's okay, I'll save dinner for you. Do you want me to pick you up?",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(),
      mood: 'caring',
    },
    {
      id: 3,
      senderId: 3,
      content: 'Hey everyone, I got an A on my math test today!',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      mood: 'excited',
      attachment: { type: 'image', url: '/math-test.jpg', placeholder: true },
    },
    {
      id: 4,
      senderId: 4,
      content:
        "Congrats Minh! Also, don't forget we have family dinner on Saturday at Golden Dragon Restaurant.",
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      mood: 'happy',
    },
    {
      id: 5,
      senderId: 2,
      content: 'I made the reservation for 7pm. Everyone can make it, right?',
      timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      mood: 'questioning',
    },
  ]);

  const [newMessage, setNewMessage] = useState('');
  const [selectedMood, setSelectedMood] = useState('neutral');

  const getMemberById = (id: number) => {
    return familyMembers.find((member) => member.id === id);
  };

  const getBgColor = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400';
      case 'green':
        return 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400';
      case 'purple':
        return 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400';
      default:
        return 'bg-gray-500/20 text-gray-600 dark:bg-gray-500/30 dark:text-gray-400';
    }
  };

  const getMoodEmoji = (mood: string) => {
    switch (mood) {
      case 'happy':
        return '😊';
      case 'sad':
        return '😔';
      case 'excited':
        return '😃';
      case 'tired':
        return '😴';
      case 'caring':
        return '🥰';
      case 'questioning':
        return '🤔';
      default:
        return '😐';
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const newMsg = {
      id: messages.length + 1,
      senderId: 3, // Assuming logged in user is Minh (Son)
      content: newMessage,
      timestamp: new Date().toISOString(),
      mood: selectedMood,
    };

    setMessages((prev) => [...prev, newMsg]);
    setNewMessage('');
    setSelectedMood('neutral');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="container mx-auto flex h-[calc(100vh-6rem)] max-w-5xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-r flex h-10 w-10 items-center justify-center rounded-full from-blue-500/80 to-purple-500/80">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Family Chat</h1>
            <p className="text-muted-foreground text-sm">
              Nguyen Family • 4 Members
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400"
          >
            4 Online
          </Badge>
          <Button size="sm" variant="outline">
            <Video className="mr-1 h-4 w-4" /> Call Family
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 md:grid-cols-[1fr_250px]">
        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 relative flex flex-col overflow-hidden backdrop-blur-sm">
          {/* Decorative elements */}
          <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>
          <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"></div>

          <ScrollArea className="relative flex-1 p-4">
            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const member = getMemberById(message.senderId);
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        className={`h-8 w-8 ${getBgColor(member?.color || '')}`}
                      >
                        <AvatarFallback>{member?.initial}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {member?.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-lg" title={message.mood}>
                        {getMoodEmoji(message.mood)}
                      </span>
                    </div>
                    <div className="ml-10">
                      <div className="bg-linear-to-r rounded-xl from-blue-500/5 to-purple-500/5 p-3 dark:from-blue-500/10 dark:to-purple-500/10">
                        <p className="text-sm">{message.content}</p>
                        {message.attachment &&
                          message.attachment.type === 'image' && (
                            <div className="mt-2">
                              {message.attachment.placeholder ? (
                                <div className="bg-linear-to-r flex h-40 w-full items-center justify-center rounded-lg from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30">
                                  <Image className="text-muted-foreground h-8 w-8" />
                                </div>
                              ) : (
                                <img
                                  src={message.attachment.url}
                                  alt="Attachment"
                                  className="h-40 w-auto rounded-lg object-cover"
                                />
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>

          <Separator className="bg-foreground/5" />

          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-full p-0"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-full p-0"
                >
                  <Image className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-full p-0"
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Mood:</span>
                <div className="flex gap-1">
                  {['happy', 'excited', 'neutral', 'tired', 'questioning'].map(
                    (mood) => (
                      <button
                        key={mood}
                        onClick={() => setSelectedMood(mood)}
                        className={`text-lg transition-transform ${
                          selectedMood === mood
                            ? 'scale-125'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        {getMoodEmoji(mood)}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here..."
                className="border-foreground/10 bg-background/60 dark:border-foreground/5 min-h-[60px] resize-none"
              />
              <Button
                onClick={handleSendMessage}
                size="icon"
                className="bg-linear-to-r h-10 w-10 rounded-full from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500"
              >
                <Send className="h-4 w-4 text-white" />
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Tabs defaultValue="members" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
            </TabsList>
            <TabsContent value="members">
              <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
                <div className="p-4">
                  <div className="flex flex-col gap-3">
                    {familyMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar
                            className={`h-8 w-8 ${getBgColor(member.color)}`}
                          >
                            <AvatarFallback>{member.initial}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {member.id === 3 ? 'You' : 'Online'}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 rounded-full p-0"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="media">
              <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
                <div className="p-4">
                  <div className="mb-2 flex justify-between">
                    <h3 className="text-sm font-medium">Recent Media</h3>
                    <Button size="sm" variant="ghost" className="h-6 text-xs">
                      View All
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                      <div
                        key={item}
                        className="bg-linear-to-r flex aspect-square items-center justify-center rounded-md from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20"
                      >
                        <Image className="text-muted-foreground h-6 w-6" />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 backdrop-blur-sm">
            <div className="bg-linear-to-r from-blue-500/10 to-purple-500/10 p-4 dark:from-blue-500/20 dark:to-purple-500/20">
              <h3 className="text-sm font-medium">Upcoming Events</h3>
            </div>
            <div className="p-4">
              <div className="border-foreground/10 dark:border-foreground/5 mb-3 rounded-lg border p-3">
                <div className="mb-1 flex justify-between">
                  <Badge className="bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400">
                    Saturday
                  </Badge>
                  <span className="text-xs font-medium">7:00 PM</span>
                </div>
                <h4 className="text-sm font-medium">Family Dinner</h4>
                <p className="text-muted-foreground text-xs">
                  Golden Dragon Restaurant
                </p>
              </div>
              <div className="border-foreground/10 dark:border-foreground/5 rounded-lg border p-3">
                <div className="mb-1 flex justify-between">
                  <Badge className="bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400">
                    Next Week
                  </Badge>
                  <span className="text-xs font-medium">All Day</span>
                </div>
                <h4 className="text-sm font-medium">Grandparents Visit</h4>
                <p className="text-muted-foreground text-xs">Home</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
