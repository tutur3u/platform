'use client';

import {
  Bot,
  CheckCircle2,
  Edit,
  LoaderCircle,
  MessageCircle,
  PanelRight,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import type {
  ChatConversation,
  ChatConversationMember,
  UpdateChatConversationPayload,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import { Button, buttonVariants } from '../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import { Input } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Separator } from '../separator';
import { getChatInitials, isReadOnlyChatConversation } from './utils';

export function ChatHeader({
  conversation,
  currentUserId,
  isDeletingConversation,
  isFetching,
  isUpdatingConversation,
  onDeleteConversation,
  onToggleSharedContent,
  onUpdateConversation,
  sharedContentOpen,
  title,
}: {
  conversation: ChatConversation | null;
  currentUserId: string;
  isDeletingConversation?: boolean;
  isFetching?: boolean;
  isUpdatingConversation?: boolean;
  onDeleteConversation?: () => void;
  onToggleSharedContent?: () => void;
  onUpdateConversation?: (
    payload: UpdateChatConversationPayload
  ) => Promise<void> | void;
  sharedContentOpen?: boolean;
  title: string;
}) {
  const t = useTranslations('chat');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const readOnly = isReadOnlyChatConversation(conversation);
  const actorMember = conversation?.members.find(
    (member) => member.userId === currentUserId
  );
  const otherMembers =
    conversation?.members.filter((member) => member.userId !== currentUserId) ??
    [];
  const canDelete = Boolean(conversation && !readOnly && onDeleteConversation);
  const canRename = Boolean(conversation && !readOnly && onUpdateConversation);
  const deleteLabel = getDeleteLabel(t, conversation);
  const deleteDescription = getDeleteDescription({
    actorRole: actorMember?.role,
    conversation,
    t,
  });
  const trimmedDraftTitle = draftTitle.trim();

  useEffect(() => {
    if (!renameOpen) setDraftTitle(title);
  }, [renameOpen, title]);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || !trimmedDraftTitle) return;

    await onUpdateConversation?.({ title: trimmedDraftTitle });
    setRenameOpen(false);
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="line-clamp-1 min-w-0 break-all font-semibold text-base">
            {title}
          </h1>
          {conversation?.aiEnabled && conversation.type !== 'ai' && (
            <Badge className="shrink-0" variant="secondary">
              <Bot className="size-3" />
              {t('ai_badge')}
            </Badge>
          )}
          {conversation?.type === 'channel' && (
            <Badge className="shrink-0" variant="outline">
              {t('channel_badge')}
            </Badge>
          )}
          {readOnly && conversation?.type !== 'ai' && (
            <Badge className="shrink-0" variant="outline">
              {t('read_only_badge')}
            </Badge>
          )}
        </div>
        {conversation ? (
          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
            <MembersPopover
              members={conversation.members}
              memberCount={conversation.memberCount}
              t={t}
            />
            {otherMembers.length > 0 && (
              <>
                <Separator className="h-3" orientation="vertical" />
                <span className="truncate">
                  {otherMembers
                    .slice(0, 3)
                    .map((member) => member.user.displayName)
                    .join(', ')}
                </span>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isFetching && (
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        {conversation ? (
          <Button
            aria-label={t('toggle_shared_content')}
            className="hidden md:inline-flex"
            data-state={sharedContentOpen ? 'open' : 'closed'}
            onClick={onToggleSharedContent}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PanelRight className="size-4" />
          </Button>
        ) : null}
        {canRename ? (
          <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
            <DialogTrigger asChild>
              <Button
                aria-label={t('rename_conversation')}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Edit className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form className="grid gap-4" onSubmit={handleRename}>
                <DialogHeader>
                  <DialogTitle>{t('rename_conversation')}</DialogTitle>
                  <DialogDescription>
                    {t('rename_conversation_description')}
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder={t('conversation_name_placeholder')}
                  value={draftTitle}
                />
                <DialogFooter>
                  <Button
                    disabled={isUpdatingConversation}
                    onClick={() => setRenameOpen(false)}
                    type="button"
                    variant="outline"
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    disabled={
                      isUpdatingConversation || trimmedDraftTitle.length === 0
                    }
                    type="submit"
                  >
                    {isUpdatingConversation ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Edit className="size-4" />
                    )}
                    {t('save')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
        {canDelete ? (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button
                aria-label={deleteLabel}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{deleteLabel}</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingConversation}>
                  {t('cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  disabled={isDeletingConversation}
                  onClick={(event) => {
                    event.preventDefault();
                    onDeleteConversation?.();
                    setDeleteOpen(false);
                  }}
                >
                  {isDeletingConversation ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t('delete_confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </header>
  );
}

function MembersPopover({
  memberCount,
  members,
  t,
}: {
  memberCount: number;
  members: ChatConversationMember[];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
          type="button"
        >
          <Users className="size-3.5" />
          <span>{t('member_count', { count: memberCount })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="font-medium text-sm">{t('members')}</p>
          <p className="text-muted-foreground text-xs">
            {t('members_description')}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} t={t} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberRow({
  member,
  t,
}: {
  member: ChatConversationMember;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2">
      <Avatar className="size-8">
        <AvatarImage
          alt={member.user.displayName}
          src={member.user.avatarUrl ?? undefined}
        />
        <AvatarFallback>{getChatInitials(member.user)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">
          {member.user.displayName}
        </p>
        {member.user.handle ? (
          <p className="truncate text-muted-foreground text-xs">
            {member.user.handle}
          </p>
        ) : null}
      </div>
      <Badge className="shrink-0" variant="outline">
        {t(`role_${member.role}`)}
      </Badge>
    </div>
  );
}

function getDeleteLabel(
  t: ReturnType<typeof useTranslations>,
  conversation: ChatConversation | null
) {
  if (conversation?.type === 'group') return t('delete_group');
  if (conversation?.type === 'channel') return t('delete_channel');
  if (conversation?.type === 'ai') return t('delete_agent');
  return t('delete_chat');
}

function getDeleteDescription({
  actorRole,
  conversation,
  t,
}: {
  actorRole?: string;
  conversation: ChatConversation | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (conversation?.type === 'group' && actorRole === 'owner') {
    return t('delete_group_owner_warning');
  }

  if (conversation?.type === 'group') {
    return t('delete_group_warning');
  }

  if (conversation?.type === 'channel' || conversation?.type === 'ai') {
    return t('delete_workspace_conversation_warning');
  }

  return t('delete_chat_warning');
}

export function EmptyConversationState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('chat');

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <MessageCircle className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h2 className="font-semibold">{t('empty_conversations_title')}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('empty_conversations_description')}
        </p>
        <Button className="mt-4" onClick={onCreate} type="button">
          <CheckCircle2 className="size-4" />
          {t('new_conversation')}
        </Button>
      </div>
    </div>
  );
}
