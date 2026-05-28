'use client';

import { LoaderCircle } from '@tuturuuu/icons';
import type {
  ChatConversation,
  ChatConversationType,
  ChatUserProfile,
} from '@tuturuuu/internal-api';
import { InternalApiError } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
import {
  useChatDirectory,
  useCreateChatConversation,
  useCreateChatFriendRequest,
} from './hooks';
import {
  type ChatConversationScope,
  getChatConversationTypesForScope,
} from './utils';

type CreateConversationStep = 'details' | 'members' | 'type';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface CreateConversationDialogProps {
  allowedTypes?: ChatConversationType[];
  conversationScope?: ChatConversationScope;
  currentUserId: string;
  defaultType?: ChatConversationType;
  onCreated: (conversation: ChatConversation) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

export function CreateConversationDialog({
  allowedTypes,
  conversationScope,
  currentUserId,
  defaultType,
  onCreated,
  onOpenChange,
  open,
  wsId,
}: CreateConversationDialogProps) {
  const t = useTranslations('chat');
  const createConversation = useCreateChatConversation(wsId);
  const createFriendRequest = useCreateChatFriendRequest(wsId);
  const effectiveAllowedTypes = useMemo(
    () =>
      allowedTypes ??
      (conversationScope
        ? getChatConversationTypesForScope(conversationScope)
        : ([
            'direct',
            'group',
            'channel',
            'ai',
          ] satisfies ChatConversationType[])),
    [allowedTypes, conversationScope]
  );
  const fallbackType = defaultType ?? effectiveAllowedTypes[0] ?? 'direct';
  const [type, setType] = useState<ChatConversationType>(fallbackType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<ChatUserProfile[]>([]);
  const [step, setStep] = useState<CreateConversationStep>('type');
  const { data: directoryUsers = [], isFetching } = useChatDirectory({
    enabled: open && (type === 'direct' || type === 'group'),
    query: directoryQuery,
    wsId,
  });

  useEffect(() => {
    if (!effectiveAllowedTypes.includes(type)) {
      setType(fallbackType);
      setSelectedUsers([]);
    }
  }, [effectiveAllowedTypes, fallbackType, type]);

  useEffect(() => {
    if (!open) return;
    setSelectedUsers((current) =>
      current.filter((user) => UUID_PATTERN.test(user.id))
    );
  }, [open]);

  const filteredUsers = useMemo(
    () =>
      directoryUsers.filter(
        (user) =>
          UUID_PATTERN.test(user.id) &&
          user.id !== currentUserId &&
          !selectedUsers.some((selected) => selected.id === user.id)
      ),
    [currentUserId, directoryUsers, selectedUsers]
  );
  const validSelectedUsers = useMemo(
    () => selectedUsers.filter((user) => UUID_PATTERN.test(user.id)),
    [selectedUsers]
  );

  const requiresTitle = type === 'group' || type === 'channel';
  const needsMembers = type === 'direct' || type === 'group';
  const needsDetails = type !== 'direct';
  const missingParticipants =
    (type === 'direct' && validSelectedUsers.length !== 1) ||
    (type === 'group' && validSelectedUsers.length < 1);
  const shouldDisableSubmit =
    createConversation.isPending ||
    (requiresTitle && title.trim().length === 0) ||
    missingParticipants;

  function reset() {
    setType(fallbackType);
    setTitle('');
    setDescription('');
    setDirectoryQuery('');
    setSelectedUsers([]);
    setStep('type');
  }

  async function handleCreateFriendRequest(email: string) {
    try {
      await createFriendRequest.mutateAsync(email);
      setDirectoryQuery('');
      toast.success(t('friend_request_sent'));
    } catch {
      toast.error(t('friend_request_failed'));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldDisableSubmit) return;

    try {
      const { conversation } = await createConversation.mutateAsync({
        aiEnabled: type === 'ai',
        description: description.trim() || null,
        participantUserIds: validSelectedUsers.map((user) => user.id),
        title: title.trim() || null,
        type,
      });
      reset();
      onCreated(conversation);
      onOpenChange(false);
    } catch (error) {
      toast.error(t('conversation_create_failed'), {
        description: getCreateConversationErrorDescription(error, t),
      });
    }
  }

  function getNextStep() {
    if (step === 'type') return needsMembers ? 'members' : 'details';
    if (step === 'members' && needsDetails) return 'details';
    return null;
  }

  function getPreviousStep() {
    if (step === 'details') return needsMembers ? 'members' : 'type';
    if (step === 'members') return 'type';
    return null;
  }

  const nextStep = getNextStep();
  const previousStep = getPreviousStep();
  const canContinue =
    step === 'type' ||
    (step === 'members' &&
      !(
        (type === 'direct' && validSelectedUsers.length !== 1) ||
        (type === 'group' && validSelectedUsers.length < 1)
      ));
  const showSubmit = !nextStep;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] overflow-hidden sm:max-w-2xl">
        <form className="flex min-h-0 flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('new_conversation')}</DialogTitle>
            <DialogDescription>
              {t('new_conversation_description')}
            </DialogDescription>
          </DialogHeader>

          {step === 'type' ? (
            <div className="grid gap-3">
              <StepTitle
                description={t('step_type_description')}
                title={t('step_type')}
              />
              <ConversationTypeSelector
                allowedTypes={effectiveAllowedTypes}
                onTypeChange={(nextType) => {
                  setType(nextType);
                  if (nextType === 'direct') {
                    setSelectedUsers((current) => current.slice(0, 1));
                  }
                }}
                type={type}
              />
            </div>
          ) : null}

          {step === 'members' ? (
            <div className="grid gap-3">
              <StepTitle
                description={
                  type === 'direct'
                    ? t('step_members_direct_description')
                    : t('step_members_group_description')
                }
                title={t('step_members')}
              />
              <DirectoryUserPicker
                canCreateFriendRequest={conversationScope !== 'workspaces'}
                directoryQuery={directoryQuery}
                filteredUsers={filteredUsers}
                isFetching={isFetching}
                isCreatingFriendRequest={createFriendRequest.isPending}
                onDirectoryQueryChange={setDirectoryQuery}
                onCreateFriendRequest={handleCreateFriendRequest}
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
            </div>
          ) : null}

          {step === 'details' ? (
            <div className="grid gap-3">
              <StepTitle
                description={t('step_details_description')}
                title={t('step_details')}
              />
              <Input
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  type === 'channel'
                    ? t('channel_name_placeholder')
                    : type === 'ai'
                      ? t('agent_name_placeholder')
                      : t('group_name_placeholder')
                }
                value={title}
              />
              {(type === 'group' || type === 'channel' || type === 'ai') && (
                <Textarea
                  className="min-h-24"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('conversation_description_placeholder')}
                  value={description}
                />
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              {t('cancel')}
            </Button>
            {previousStep ? (
              <Button
                onClick={() => setStep(previousStep)}
                type="button"
                variant="outline"
              >
                {t('back')}
              </Button>
            ) : null}
            {showSubmit ? (
              <Button disabled={shouldDisableSubmit} type="submit">
                {createConversation.isPending && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                {t('create')}
              </Button>
            ) : (
              <Button
                disabled={!canContinue}
                onClick={() => nextStep && setStep(nextStep)}
                type="button"
              >
                {t('next')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StepTitle({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="mt-1 text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function getCreateConversationErrorDescription(
  error: unknown,
  t: ReturnType<typeof useTranslations>
) {
  if (!(error instanceof InternalApiError)) return undefined;

  if (error.message.includes('chat_target_not_invitable')) {
    return t('conversation_create_target_not_invitable');
  }

  if (error.message.includes('chat_direct_requires_one_target')) {
    return t('conversation_create_direct_requires_one_target');
  }

  if (error.message.includes('chat_group_requires_members')) {
    return t('conversation_create_group_requires_members');
  }

  if (error.message.includes('chat_permission_required')) {
    return t('conversation_create_permission_required');
  }

  return error.message;
}
