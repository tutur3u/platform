'use client';

import { LoaderCircle } from '@tuturuuu/icons';
import type {
  ChatConversation,
  ChatConversationType,
  ChatUserProfile,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import { Input } from '../input';
import { toast } from '../sonner';
import { Textarea } from '../textarea';
import { ConversationTypeSelector } from './conversation-type-selector';
import { DirectoryUserPicker } from './directory-user-picker';
import { useChatDirectory, useCreateChatConversation } from './hooks';

interface CreateConversationDialogProps {
  currentUserId: string;
  onCreated: (conversation: ChatConversation) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

export function CreateConversationDialog({
  currentUserId,
  onCreated,
  onOpenChange,
  open,
  wsId,
}: CreateConversationDialogProps) {
  const t = useTranslations('chat');
  const createConversation = useCreateChatConversation(wsId);
  const [type, setType] = useState<ChatConversationType>('direct');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<ChatUserProfile[]>([]);
  const { data: directoryUsers = [], isFetching } = useChatDirectory({
    enabled: open && type !== 'channel',
    query: directoryQuery,
    wsId,
  });

  const filteredUsers = useMemo(
    () =>
      directoryUsers.filter(
        (user) =>
          user.id !== currentUserId &&
          !selectedUsers.some((selected) => selected.id === user.id)
      ),
    [currentUserId, directoryUsers, selectedUsers]
  );

  const requiresTitle = type === 'group' || type === 'channel';
  const missingParticipants =
    (type === 'direct' && selectedUsers.length !== 1) ||
    (type === 'group' && selectedUsers.length < 1);
  const shouldDisableSubmit =
    createConversation.isPending ||
    (requiresTitle && title.trim().length === 0) ||
    missingParticipants;

  function reset() {
    setType('direct');
    setTitle('');
    setDescription('');
    setDirectoryQuery('');
    setSelectedUsers([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldDisableSubmit) return;

    try {
      const { conversation } = await createConversation.mutateAsync({
        aiEnabled: type === 'ai',
        description: description.trim() || null,
        participantUserIds: selectedUsers.map((user) => user.id),
        title: title.trim() || null,
        type,
      });
      reset();
      onCreated(conversation);
      onOpenChange(false);
    } catch {
      toast.error(t('conversation_create_failed'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] overflow-hidden sm:max-w-2xl">
        <form className="flex min-h-0 flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('new_conversation')}</DialogTitle>
            <DialogDescription>
              {t('new_conversation_description')}
            </DialogDescription>
          </DialogHeader>

          <ConversationTypeSelector
            onTypeChange={(nextType) => {
              setType(nextType);
              if (nextType === 'direct') {
                setSelectedUsers((current) => current.slice(0, 1));
              }
            }}
            type={type}
          />

          {type !== 'direct' && (
            <Input
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                type === 'channel'
                  ? t('channel_name_placeholder')
                  : t('group_name_placeholder')
              }
              value={title}
            />
          )}

          {(type === 'group' || type === 'channel') && (
            <Textarea
              className="min-h-20"
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('conversation_description_placeholder')}
              value={description}
            />
          )}

          {type !== 'channel' && (
            <DirectoryUserPicker
              directoryQuery={directoryQuery}
              filteredUsers={filteredUsers}
              isFetching={isFetching}
              onDirectoryQueryChange={setDirectoryQuery}
              onRemoveUser={(userId) =>
                setSelectedUsers((current) =>
                  current.filter((item) => item.id !== userId)
                )
              }
              onSelectUser={(user) =>
                setSelectedUsers((current) =>
                  type === 'direct' ? [user] : [...current, user]
                )
              }
              selectedUsers={selectedUsers}
            />
          )}

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t('cancel')}
            </Button>
            <Button disabled={shouldDisableSubmit} type="submit">
              {createConversation.isPending && (
                <LoaderCircle className="size-4 animate-spin" />
              )}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
