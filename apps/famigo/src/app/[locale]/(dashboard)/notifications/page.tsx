'use client';

import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Bell,
  Calendar,
  Check,
  MessageCircle,
  Settings,
  Star,
  UserPlus,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import { useState } from 'react';

type NotificationType = 'message' | 'event' | 'invite' | 'reaction' | 'system';
type ColorType = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | string;

interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  description: string;
  time: string;
  read: boolean;
  avatar: {
    initial: string;
    color: ColorType;
  };
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | NotificationType>('all');

  const notifications: Notification[] = [
    {
      id: 1,
      type: 'message',
      title: 'New message from Linh (Mom)',
      description: 'Are you coming home for dinner tonight?',
      time: '10 minutes ago',
      read: false,
      avatar: {
        initial: 'L',
        color: 'green',
      },
    },
    {
      id: 2,
      type: 'event',
      title: 'Family Dinner Reminder',
      description: 'Tomorrow at 7:00 PM - Golden Dragon Restaurant',
      time: '1 hour ago',
      read: false,
      avatar: {
        initial: 'C',
        color: 'blue',
      },
    },
    {
      id: 3,
      type: 'invite',
      title: 'Grandparents joined Famigo',
      description: 'Grandma and Grandpa are now on Famigo',
      time: '2 hours ago',
      read: true,
      avatar: {
        initial: 'G',
        color: 'orange',
      },
    },
    {
      id: 4,
      type: 'reaction',
      title: 'Duc (Dad) liked your update',
      description: 'Your math test photo received a reaction',
      time: '5 hours ago',
      read: true,
      avatar: {
        initial: 'D',
        color: 'blue',
      },
    },
    {
      id: 5,
      type: 'event',
      title: 'Movie Afternoon Update',
      description: 'Location changed to City Cinema',
      time: '1 day ago',
      read: true,
      avatar: {
        initial: 'C',
        color: 'blue',
      },
    },
    {
      id: 6,
      type: 'message',
      title: 'Suong (Sister) mentioned you',
      description: 'In the family chat: "Can @Minh help with setup?"',
      time: '1 day ago',
      read: true,
      avatar: {
        initial: 'S',
        color: 'pink',
      },
    },
    {
      id: 7,
      type: 'system',
      title: 'Weekly Family Summary',
      description: "View your family's activity recap for the week",
      time: '2 days ago',
      read: true,
      avatar: {
        initial: 'F',
        color: 'purple',
      },
    },
  ];

  const getBgColor = (color: ColorType): string => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400';
      case 'green':
        return 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400';
      case 'purple':
        return 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400';
      case 'pink':
        return 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400';
      case 'orange':
        return 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400';
      default:
        return 'bg-gray-500/20 text-muted-foreground dark:bg-gray-500/30 dark:text-gray-400';
    }
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'message':
        return <MessageCircle className="h-4 w-4" />;
      case 'event':
        return <Calendar className="h-4 w-4" />;
      case 'invite':
        return <UserPlus className="h-4 w-4" />;
      case 'reaction':
        return <Star className="h-4 w-4" />;
      case 'system':
        return <Bell className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: NotificationType): string => {
    switch (type) {
      case 'message':
        return 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400';
      case 'event':
        return 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400';
      case 'invite':
        return 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-400';
      case 'reaction':
        return 'bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-400';
      case 'system':
        return 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/30 dark:text-orange-400';
      default:
        return 'bg-gray-500/20 text-muted-foreground dark:bg-gray-500/30 dark:text-gray-400';
    }
  };

  const filteredNotifications =
    activeTab === 'all'
      ? notifications
      : notifications.filter((n) => n.type === activeTab);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-linear-to-r flex h-10 w-10 items-center justify-center rounded-full from-blue-500/80 to-purple-500/80">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground text-sm">
              Stay updated on your family's activities
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Badge className="bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-400">
              {unreadCount} Unread
            </Badge>
          )}
          <Button size="sm" variant="outline">
            <Settings className="mr-1 h-4 w-4" /> Preferences
          </Button>
        </div>
      </div>

      <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 relative overflow-hidden backdrop-blur-sm">
        {/* Decorative elements */}
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"></div>
        <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl dark:bg-purple-500/20"></div>

        <CardHeader className="pb-2">
          <Tabs
            defaultValue="all"
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as 'all' | NotificationType)
            }
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="message">Messages</TabsTrigger>
              <TabsTrigger value="event">Events</TabsTrigger>
              <TabsTrigger value="invite">Invites</TabsTrigger>
              <TabsTrigger value="reaction">Reactions</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="divide-foreground/5 divide-y">
              {filteredNotifications.length > 0 ? (
                filteredNotifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`hover:bg-foreground/5 flex gap-4 p-4 ${
                      !notification.read
                        ? 'bg-blue-500/5 dark:bg-blue-500/10'
                        : ''
                    }`}
                  >
                    <Avatar
                      className={`h-10 w-10 ${getBgColor(notification.avatar.color)}`}
                    >
                      <AvatarFallback>
                        {notification.avatar.initial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{notification.title}</p>
                          <Badge
                            variant="outline"
                            className={`${getTypeBadge(notification.type)}`}
                          >
                            {getTypeIcon(notification.type)}
                            <span className="ml-1">
                              {notification.type.charAt(0).toUpperCase() +
                                notification.type.slice(1)}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {notification.time}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {notification.description}
                      </p>
                    </div>
                    <div className="flex items-center">
                      {!notification.read ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 rounded-full p-0"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <Bell className="text-muted-foreground mb-2 h-12 w-12 opacity-20" />
                  <p className="text-muted-foreground text-center">
                    No {activeTab !== 'all' ? activeTab : ''} notifications
                    found
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-linear-to-r from-blue-500/10 to-purple-500/10 pb-2 dark:from-blue-500/20 dark:to-purple-500/20">
            <CardTitle className="text-base">Notification Settings</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <Button size="sm" variant="outline" className="w-full">
                Customize Notifications
              </Button>
              <Button size="sm" variant="outline" className="w-full">
                Manage Alerts
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-linear-to-r from-green-500/10 to-teal-500/10 pb-2 dark:from-green-500/20 dark:to-teal-500/20">
            <CardTitle className="text-base">Weekly Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CardDescription className="text-foreground/80 mb-4">
              Get a weekly recap of all important family activities
            </CardDescription>
            <div className="text-center">
              <Badge variant="outline">Every Sunday</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-foreground/10 bg-background/60 dark:border-foreground/5 overflow-hidden backdrop-blur-sm">
          <CardHeader className="bg-linear-to-r from-pink-500/10 to-rose-500/10 pb-2 dark:from-pink-500/20 dark:to-rose-500/20">
            <CardTitle className="text-base">Do Not Disturb</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CardDescription className="text-foreground/80 mb-4">
              Set quiet hours for notifications
            </CardDescription>
            <Button size="sm" variant="outline" className="w-full">
              Configure Schedule
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
