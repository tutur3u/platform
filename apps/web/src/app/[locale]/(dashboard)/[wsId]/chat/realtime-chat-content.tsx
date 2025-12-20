'use client';

import {
  Check,
  CheckCheck,
  Hash,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Users,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';

type Channel = Database['public']['Tables']['workspace_chat_channels']['Row'];
type Message = Database['public']['Tables']['workspace_chat_messages']['Row'];
type User = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

interface RealtimeChatContentProps {
  wsId: string;
  userId: string;
}

export default function RealtimeChatContent({
  wsId,
  userId,
}: RealtimeChatContentProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [newMessage, setNewMessage] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [readReceipts, setReadReceipts] = useState<Map<string, number>>(
    new Map()
  );
  const [messageReaders, setMessageReaders] = useState<Map<string, User[]>>(
    new Map()
  );
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from('workspace_chat_channels')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load channels');
      return;
    }

    setChannels(data || []);
    // Only set selected channel if none is selected yet
    setSelectedChannel((prev) => {
      if (!prev && data && data.length > 0) {
        return data[0]!;
      }
      return prev;
    });
  }, [supabase, wsId]);

  const loadMessages = useCallback(
    async (channelId: string) => {
      setIsLoadingMessages(true);
      const { data, error } = await supabase
        .from('workspace_chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      setIsLoadingMessages(false);

      if (error) {
        toast.error('Failed to load messages');
        return;
      }

      setMessages(data || []);

      // Load user information for all unique user IDs
      if (data && data.length > 0) {
        const uniqueUserIds = [...new Set(data.map((msg) => msg.user_id))];
        const { data: userData } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', uniqueUserIds);

        if (userData) {
          setUsers(new Map(userData.map((u) => [u.id, u])));
        }

        // Load read receipts for each message
        const { data: participants } = await supabase
          .from('workspace_chat_participants')
          .select('user_id, last_read_at')
          .eq('channel_id', channelId)
          .neq('user_id', userId);

        if (participants) {
          // Get unique user IDs from participants
          const participantUserIds = [
            ...new Set(participants.map((p) => p.user_id)),
          ];
          const { data: participantUsers } = await supabase
            .from('users')
            .select('id, display_name, avatar_url')
            .in('id', participantUserIds);

          const participantUserMap = new Map(
            participantUsers?.map((u) => [u.id, u]) || []
          );

          // Count how many participants have read each message and track who
          const receipts = new Map<string, number>();
          const readers = new Map<string, User[]>();

          for (const msg of data) {
            if (msg.user_id === userId && msg.created_at) {
              const msgTime = new Date(msg.created_at).getTime();
              const readParticipants = participants.filter((p) => {
                if (!p.last_read_at) return false;
                return new Date(p.last_read_at).getTime() >= msgTime;
              });

              receipts.set(msg.id, readParticipants.length);

              // Get user info for readers
              const readerUsers = readParticipants
                .map((p) => participantUserMap.get(p.user_id))
                .filter((u): u is User => u !== undefined);

              readers.set(msg.id, readerUsers);
            }
          }
          setReadReceipts(receipts);
          setMessageReaders(readers);
        }
      }
    },
    [supabase, userId]
  );

  const joinChannel = useCallback(
    async (channelId: string) => {
      const { error } = await supabase
        .from('workspace_chat_participants')
        .upsert(
          {
            channel_id: channelId,
            user_id: userId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'channel_id,user_id' }
        );

      if (error) {
        console.error('Failed to join channel:', error);
      }

      // Load participant count
      const { count } = await supabase
        .from('workspace_chat_participants')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId);

      setParticipantCount(count || 0);
    },
    [supabase, userId]
  );

  const subscribeToMessages = useCallback(
    (channelId: string) => {
      const channel = supabase
        .channel(`chat-${channelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workspace_chat_messages',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const newMsg = payload.new as Message;

            // Load user info if not already loaded
            setUsers((prevUsers) => {
              // Check if user already exists
              if (!prevUsers.has(newMsg.user_id)) {
                // Fetch user data asynchronously
                supabase
                  .from('users')
                  .select('id, display_name, avatar_url')
                  .eq('id', newMsg.user_id)
                  .single()
                  .then(({ data: userData }) => {
                    if (userData) {
                      setUsers((prev) =>
                        new Map(prev).set(userData.id, userData)
                      );
                    }
                  });
              }
              return prevUsers;
            });

            // Only add if not already in messages (avoid duplicate from optimistic update)
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              // Remove optimistic message if exists
              const filtered = prev.filter((m) => !m.id.startsWith('temp-'));
              return [...filtered, newMsg];
            });

            // Remove typing indicator for user who just sent a message
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(newMsg.user_id);
              return next;
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workspace_chat_participants',
            filter: `channel_id=eq.${channelId}`,
          },
          async () => {
            // Reload read receipts when someone updates their read status
            const { data: participants } = await supabase
              .from('workspace_chat_participants')
              .select('user_id, last_read_at')
              .eq('channel_id', channelId)
              .neq('user_id', userId);

            if (participants) {
              // Get unique user IDs from participants
              const participantUserIds = [
                ...new Set(participants.map((p) => p.user_id)),
              ];
              const { data: participantUsers } = await supabase
                .from('users')
                .select('id, display_name, avatar_url')
                .in('id', participantUserIds);

              const participantUserMap = new Map(
                participantUsers?.map((u) => [u.id, u]) || []
              );

              setMessages((msgs) => {
                const receipts = new Map<string, number>();
                const readers = new Map<string, User[]>();

                for (const msg of msgs) {
                  if (msg.user_id === userId && msg.created_at) {
                    const msgTime = new Date(msg.created_at).getTime();
                    const readParticipants = participants.filter((p) => {
                      if (!p.last_read_at) return false;
                      return new Date(p.last_read_at).getTime() >= msgTime;
                    });

                    receipts.set(msg.id, readParticipants.length);

                    // Get user info for readers
                    const readerUsers = readParticipants
                      .map((p) => participantUserMap.get(p.user_id))
                      .filter((u): u is User => u !== undefined);

                    readers.set(msg.id, readerUsers);
                  }
                }
                setReadReceipts(receipts);
                setMessageReaders(readers);
                return msgs;
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'workspace_chat_typing_indicators',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const indicator = payload.new as {
              user_id: string;
              channel_id: string;
            };
            // Only show typing indicator for other users
            if (indicator.user_id !== userId) {
              setTypingUsers((prev) => new Set(prev).add(indicator.user_id));

              // Load user info if not already loaded
              setUsers((prevUsers) => {
                if (!prevUsers.has(indicator.user_id)) {
                  supabase
                    .from('users')
                    .select('id, display_name, avatar_url')
                    .eq('id', indicator.user_id)
                    .single()
                    .then(({ data: userData }) => {
                      if (userData) {
                        setUsers((prev) =>
                          new Map(prev).set(userData.id, userData)
                        );
                      }
                    });
                }
                return prevUsers;
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workspace_chat_typing_indicators',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const indicator = payload.new as {
              user_id: string;
              channel_id: string;
            };
            // Only show typing indicator for other users
            if (indicator.user_id !== userId) {
              setTypingUsers((prev) => new Set(prev).add(indicator.user_id));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'workspace_chat_typing_indicators',
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const indicator = payload.old as {
              user_id: string;
              channel_id: string;
            };
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(indicator.user_id);
              return next;
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
    [supabase, userId]
  );

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel.id);
      joinChannel(selectedChannel.id);
      const cleanup = subscribeToMessages(selectedChannel.id);
      return cleanup;
    }
  }, [selectedChannel, joinChannel, loadMessages, subscribeToMessages]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  // Update read status when viewing messages
  useEffect(() => {
    if (selectedChannel && messages.length > 0) {
      const updateReadStatus = async () => {
        await supabase
          .from('workspace_chat_participants')
          .update({ last_read_at: new Date().toISOString() })
          .eq('channel_id', selectedChannel.id)
          .eq('user_id', userId);
      };
      updateReadStatus();
    }
  }, [messages, selectedChannel, supabase, userId]);

  const createChannel = async () => {
    if (!newChannelName.trim()) {
      toast.error('Channel name cannot be empty');
      return;
    }

    const { data, error } = await supabase
      .from('workspace_chat_channels')
      .insert({
        ws_id: wsId,
        name: newChannelName.trim(),
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create channel');
      return;
    }

    setChannels((prev) => [data, ...prev]);
    setNewChannelName('');
    setShowCreateChannel(false);
    setSelectedChannel(data);
    toast.success('Channel created successfully');
  };

  const sendMessage = async () => {
    if (!selectedChannel || !newMessage.trim() || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Clear typing indicator timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Remove typing indicator
    await supabase
      .from('workspace_chat_typing_indicators')
      .delete()
      .eq('channel_id', selectedChannel.id)
      .eq('user_id', userId);

    // Optimistic update: immediately add message to UI
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      channel_id: selectedChannel.id,
      user_id: userId,
      content: messageContent,
      created_at: new Date().toISOString(),
      updated_at: null,
      deleted_at: null,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    const { error } = await supabase.from('workspace_chat_messages').insert({
      channel_id: selectedChannel.id,
      user_id: userId,
      content: messageContent,
    });

    setIsSending(false);

    if (error) {
      toast.error('Failed to send message');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      setNewMessage(messageContent);
      return;
    }
  };

  const broadcastTyping = useCallback(async () => {
    if (!selectedChannel) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Upsert typing indicator
    await supabase.from('workspace_chat_typing_indicators').upsert(
      {
        channel_id: selectedChannel.id,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'channel_id,user_id' }
    );

    // Set timeout to remove typing indicator after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('workspace_chat_typing_indicators')
        .delete()
        .eq('channel_id', selectedChannel.id)
        .eq('user_id', userId);
    }, 3000);
  }, [selectedChannel, supabase, userId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-3 overflow-hidden">
      {/* Channel Sidebar */}
      <div className="flex w-60 flex-col rounded-lg border border-dynamic-border/50 bg-dynamic-surface/50 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-dynamic-foreground text-sm">
            <MessageCircle className="h-4 w-4" />
            Channels
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCreateChannel(!showCreateChannel)}
            className="h-7 w-7 p-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {showCreateChannel && (
          <div className="mb-3 space-y-2">
            <Input
              placeholder="Channel name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createChannel();
                }
              }}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={createChannel}
                className="h-7 flex-1 text-xs"
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowCreateChannel(false);
                  setNewChannelName('');
                }}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Separator className="my-3" />

        <ScrollArea className="flex-1">
          <div className="space-y-0.5">
            {channels.length === 0 ? (
              <p className="p-2 text-center text-dynamic-muted-foreground text-xs">
                No channels yet. Create one!
              </p>
            ) : (
              channels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel)}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-all ${
                    selectedChannel?.id === channel.id
                      ? 'bg-dynamic-accent/80 font-medium text-dynamic-foreground'
                      : 'text-dynamic-muted-foreground hover:bg-dynamic-accent/30 hover:text-dynamic-foreground'
                  }`}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate text-xs">{channel.name}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-dynamic-border/50 bg-dynamic-surface/50">
        {selectedChannel ? (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-dynamic-border/50 border-b px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="flex items-center gap-2 font-semibold text-dynamic-foreground text-sm">
                  <Hash className="h-4 w-4 text-dynamic-muted-foreground" />
                  {selectedChannel.name}
                </h2>
                {participantCount > 0 && (
                  <div className="flex items-center gap-1.5 pl-6 text-[10px] text-dynamic-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>
                      {participantCount}{' '}
                      {participantCount === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                )}
              </div>
              <Badge
                variant="secondary"
                className="h-6 border border-dynamic-border/50 text-[10px]"
              >
                <Users className="mr-1 h-3 w-3" />
                {participantCount}
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              {isLoadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-dynamic-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div className="space-y-2">
                    <MessageCircle className="mx-auto h-8 w-8 text-dynamic-muted-foreground/50" />
                    <p className="text-dynamic-muted-foreground text-sm">
                      No messages yet. Start the conversation!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {messages.map((message, index) => {
                    const isOptimistic = message.id.startsWith('temp-');
                    const isOwn = message.user_id === userId;
                    const user = users.get(message.user_id);
                    const prevMessage = index > 0 ? messages[index - 1] : null;
                    const showAvatar =
                      !prevMessage || prevMessage.user_id !== message.user_id;

                    // Show date divider
                    const messageDate = message.created_at
                      ? new Date(message.created_at)
                      : null;
                    const prevDate = prevMessage?.created_at
                      ? new Date(prevMessage.created_at)
                      : null;
                    const showDateDivider =
                      messageDate &&
                      (!prevDate ||
                        messageDate.toDateString() !== prevDate.toDateString());

                    const initials = user?.display_name
                      ? user.display_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                      : '?';

                    const formatDate = (date: Date) => {
                      const today = new Date();
                      const yesterday = new Date(today);
                      yesterday.setDate(yesterday.getDate() - 1);

                      if (date.toDateString() === today.toDateString()) {
                        return 'Today';
                      } else if (
                        date.toDateString() === yesterday.toDateString()
                      ) {
                        return 'Yesterday';
                      } else {
                        return date.toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year:
                            date.getFullYear() !== today.getFullYear()
                              ? 'numeric'
                              : undefined,
                        });
                      }
                    };

                    return (
                      <div key={message.id}>
                        {showDateDivider && messageDate && (
                          <div className="my-4 flex items-center justify-center">
                            <Badge
                              variant="secondary"
                              className="border border-dynamic-border/50 text-[10px]"
                            >
                              {formatDate(messageDate)}
                            </Badge>
                          </div>
                        )}
                        <div
                          className={`group flex gap-2 px-2 py-1 transition-colors hover:bg-dynamic-accent/20 ${
                            isOwn ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          {/* Avatar */}
                          <div className="shrink-0">
                            {showAvatar ? (
                              <Avatar className="h-7 w-7 border border-dynamic-border/50">
                                {user?.avatar_url ? (
                                  <AvatarImage
                                    src={user.avatar_url}
                                    alt={user.display_name || 'User'}
                                  />
                                ) : null}
                                <AvatarFallback className="bg-dynamic-accent text-[10px] text-dynamic-foreground">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="h-7 w-7" />
                            )}
                          </div>

                          {/* Message Content */}
                          <div
                            className={`flex min-w-0 max-w-[70%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                          >
                            {showAvatar && (
                              <div
                                className={`mb-1 flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                              >
                                <span className="font-medium text-dynamic-foreground text-xs">
                                  {isOwn
                                    ? 'You'
                                    : user?.display_name || 'Unknown User'}
                                </span>
                                {message.created_at && (
                                  <span className="text-[10px] text-dynamic-muted-foreground">
                                    {new Date(
                                      message.created_at
                                    ).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </div>
                            )}
                            <div
                              className={`rounded-lg px-3 py-2 transition-all ${
                                isOwn
                                  ? 'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue'
                                  : 'border border-dynamic-border/50 bg-background text-dynamic-foreground'
                              } ${isOptimistic ? 'opacity-50' : 'opacity-100'}`}
                            >
                              <p className="wrap-break-word text-sm leading-relaxed">
                                {message.content}
                              </p>
                              {isOwn && (
                                <TooltipProvider>
                                  <div className="mt-1 flex items-center justify-end gap-1.5">
                                    {/* Reader avatars */}
                                    {messageReaders.get(message.id) &&
                                      messageReaders.get(message.id)!.length >
                                        0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex cursor-help -space-x-1">
                                              {messageReaders
                                                .get(message.id)!
                                                .slice(0, 3)
                                                .map((reader) => (
                                                  <Avatar
                                                    key={reader.id}
                                                    className="h-4 w-4 border border-dynamic-blue/30 ring-1 ring-background"
                                                  >
                                                    {reader.avatar_url ? (
                                                      <AvatarImage
                                                        src={reader.avatar_url}
                                                        alt={
                                                          reader.display_name ||
                                                          'User'
                                                        }
                                                      />
                                                    ) : null}
                                                    <AvatarFallback className="bg-dynamic-blue/20 text-[8px] text-dynamic-blue">
                                                      {reader.display_name
                                                        ? reader.display_name
                                                            .split(' ')
                                                            .map((n) => n[0])
                                                            .join('')
                                                            .toUpperCase()
                                                            .slice(0, 2)
                                                        : '?'}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                ))}
                                              {messageReaders.get(message.id)!
                                                .length > 3 && (
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full border border-dynamic-blue/30 bg-dynamic-blue/20 text-[8px] text-dynamic-blue ring-1 ring-background">
                                                  +
                                                  {messageReaders.get(
                                                    message.id
                                                  )!.length - 3}
                                                </div>
                                              )}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            className="max-w-xs"
                                          >
                                            <div className="space-y-1">
                                              <p className="font-semibold text-xs">
                                                Seen by:
                                              </p>
                                              {messageReaders
                                                .get(message.id)!
                                                .map((reader) => (
                                                  <p
                                                    key={reader.id}
                                                    className="text-xs"
                                                  >
                                                    {reader.display_name ||
                                                      'Unknown User'}
                                                  </p>
                                                ))}
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    {/* Status icon */}
                                    {isOptimistic ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-dynamic-blue/50" />
                                    ) : (readReceipts.get(message.id) ?? 0) >
                                      0 ? (
                                      <CheckCheck className="h-3 w-3 text-dynamic-blue" />
                                    ) : (
                                      <Check className="h-3 w-3 text-dynamic-blue/50" />
                                    )}
                                  </div>
                                </TooltipProvider>
                              )}
                            </div>
                            {!showAvatar && message.created_at && (
                              <span className="mt-0.5 text-[9px] text-dynamic-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                {new Date(
                                  message.created_at
                                ).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {typingUsers.size > 0 && (
                    <div className="flex gap-2 px-2 py-1">
                      <div className="shrink-0">
                        <div className="h-7 w-7" />
                      </div>
                      <div className="flex min-w-0 flex-col items-start">
                        <div className="flex items-center gap-2 rounded-lg border border-dynamic-border/50 bg-dynamic-accent/20 px-3 py-2">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-dynamic-muted-foreground [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-dynamic-muted-foreground [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-dynamic-muted-foreground" />
                          </div>
                        </div>
                        <span className="mt-1 text-[10px] text-dynamic-muted-foreground">
                          {Array.from(typingUsers)
                            .map((uid) => {
                              const user = users.get(uid);
                              return user?.display_name || 'Someone';
                            })
                            .join(', ')}{' '}
                          {typingUsers.size === 1 ? 'is' : 'are'} typing...
                        </span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="shrink-0 border-dynamic-border/50 border-t px-4 py-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    placeholder={`Message #${selectedChannel.name}`}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      if (e.target.value) {
                        broadcastTyping();
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    className="h-9 border-dynamic-border/50 text-sm"
                    disabled={isSending}
                  />
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-dynamic-muted-foreground">
                    <span>Press Enter to send</span>
                  </div>
                </div>
                <Button
                  onClick={sendMessage}
                  size="icon"
                  disabled={isSending || !newMessage.trim()}
                  className="h-9 w-9 shrink-0"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-2">
              <MessageCircle className="mx-auto h-10 w-10 text-dynamic-muted-foreground/50" />
              <p className="text-dynamic-muted-foreground text-sm">
                Select a channel to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
