'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Loader2,
  Mail,
  Phone,
  Users,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { DuplicateGroup } from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useDuplicateWorkspaceUsers } from './hooks';
import { MergePreviewDialog } from './merge-preview-dialog';

interface Props {
  wsId: string;
  canMerge?: boolean;
}

export function DuplicateDetectionDialog({ wsId, canMerge = false }: Props) {
  const t = useTranslations('ws-users');
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'email' | 'phone'>('all');

  const { data, isLoading, error, refetch } = useDuplicateWorkspaceUsers(
    wsId,
    activeTab,
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          {t('duplicates.find_duplicates')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-dynamic-yellow" />
            {t('duplicates.title')}
          </DialogTitle>
          <DialogDescription>{t('duplicates.description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'all' | 'email' | 'phone')}
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all" className="gap-2">
                {t('duplicates.all')}
                {data && (
                  <Badge variant="secondary" className="ml-1">
                    {data.totalGroups}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="h-3 w-3" />
                {t('duplicates.email_duplicates')}
                {data && (
                  <Badge variant="secondary" className="ml-1">
                    {data.emailGroups}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="phone" className="gap-2">
                <Phone className="h-3 w-3" />
                {t('duplicates.phone_duplicates')}
                {data && (
                  <Badge variant="secondary" className="ml-1">
                    {data.phoneGroups}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('duplicates.refresh')}
            </Button>
          </div>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="flex h-75 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex h-75 flex-col items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-8 w-8" />
                <p>{t('duplicates.error_loading')}</p>
              </div>
            ) : !data || data.duplicates.length === 0 ? (
              <div className="flex h-75 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Users className="h-8 w-8" />
                <p>{t('duplicates.no_duplicates')}</p>
              </div>
            ) : (
              <ScrollArea className="h-100 pr-4">
                <div className="space-y-4">
                  {data.duplicates.map((group) => (
                    <DuplicateGroupCard
                      key={`${group.duplicateField}-${group.duplicateKey}`}
                      group={group}
                      wsId={wsId}
                      canMerge={canMerge}
                      onMergeComplete={() => refetch()}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  wsId: string;
  canMerge: boolean;
  onMergeComplete: () => void;
}

function DuplicateGroupCard({
  group,
  wsId,
  canMerge,
  onMergeComplete,
}: DuplicateGroupCardProps) {
  const t = useTranslations('ws-users');
  const [expanded, setExpanded] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<{
    keep: WorkspaceUser | null;
    delete: WorkspaceUser | null;
  }>({ keep: null, delete: null });
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  // Mask email/phone for privacy display
  const maskValue = (value: string, type: 'email' | 'phone') => {
    if (type === 'email') {
      const [localPart, domain] = value.split('@');
      if (!localPart || !domain) return value;
      const masked =
        localPart.substring(0, 2) +
        '***' +
        (localPart.length > 2 ? localPart.substring(localPart.length - 1) : '');
      return `${masked}@${domain}`;
    } else {
      // Phone: show first 3 and last 2 digits
      const digits = value.replace(/\D/g, '');
      if (digits.length <= 5) return value;
      return `${digits.substring(0, 3)}***${digits.substring(digits.length - 2)}`;
    }
  };

  const handleSelectForMerge = (
    user: WorkspaceUser,
    role: 'keep' | 'delete'
  ) => {
    setSelectedUsers((prev) => {
      // If clicking the same user in the same role, deselect
      if (prev[role]?.id === user.id) {
        return { ...prev, [role]: null };
      }
      // If this user is already selected in the other role, swap
      const otherRole = role === 'keep' ? 'delete' : 'keep';
      if (prev[otherRole]?.id === user.id) {
        return {
          keep: role === 'keep' ? user : prev.keep,
          delete: role === 'delete' ? user : prev.delete,
        };
      }
      return { ...prev, [role]: user };
    });
  };

  const canStartMerge =
    canMerge &&
    selectedUsers.keep !== null &&
    selectedUsers.delete !== null &&
    selectedUsers.keep.id !== selectedUsers.delete.id;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Badge
            variant="outline"
            className={cn(
              group.duplicateField === 'email'
                ? 'border-dynamic-blue text-dynamic-blue'
                : 'border-dynamic-green text-dynamic-green'
            )}
          >
            {group.duplicateField === 'email' ? (
              <Mail className="mr-1 h-3 w-3" />
            ) : (
              <Phone className="mr-1 h-3 w-3" />
            )}
            {maskValue(group.duplicateKey, group.duplicateField)}
          </Badge>
          <span className="text-muted-foreground text-sm">
            {group.users.length} {t('duplicates.users_found')}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pt-2 pb-4">
          <div className="mb-4 space-y-2">
            {group.users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isSelectedAsKeep={selectedUsers.keep?.id === user.id}
                isSelectedAsDelete={selectedUsers.delete?.id === user.id}
                canMerge={canMerge}
                onSelectKeep={() => handleSelectForMerge(user, 'keep')}
                onSelectDelete={() => handleSelectForMerge(user, 'delete')}
              />
            ))}
          </div>

          {canMerge && (
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              {canStartMerge && (
                <MergePreviewDialog
                  wsId={wsId}
                  keepUser={selectedUsers.keep!}
                  deleteUser={selectedUsers.delete!}
                  open={mergeDialogOpen}
                  onOpenChange={setMergeDialogOpen}
                  onMergeComplete={() => {
                    setSelectedUsers({ keep: null, delete: null });
                    setMergeDialogOpen(false);
                    onMergeComplete();
                  }}
                />
              )}
              <Button
                size="sm"
                disabled={!canStartMerge}
                onClick={() => setMergeDialogOpen(true)}
                className="gap-2"
              >
                <GitMerge className="h-4 w-4" />
                {t('duplicates.merge_selected')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface UserCardProps {
  user: WorkspaceUser;
  isSelectedAsKeep: boolean;
  isSelectedAsDelete: boolean;
  canMerge: boolean;
  onSelectKeep: () => void;
  onSelectDelete: () => void;
}

function UserCard({
  user,
  isSelectedAsKeep,
  isSelectedAsDelete,
  canMerge,
  onSelectKeep,
  onSelectDelete,
}: UserCardProps) {
  const t = useTranslations('ws-users');

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border p-3',
        isSelectedAsKeep && 'border-dynamic-green bg-dynamic-green/10',
        isSelectedAsDelete && 'border-dynamic-red bg-dynamic-red/10'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              width={40}
              height={40}
            />
          ) : (
            <Users className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-medium">
            {user.full_name ||
              user.display_name ||
              t('duplicates.unnamed_user')}
          </p>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            {user.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {user.email}
              </span>
            )}
            {user.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {user.phone}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('duplicates.created')}:{' '}
            {user.created_at
              ? new Date(user.created_at).toLocaleDateString()
              : '-'}
          </p>
        </div>
      </div>

      {canMerge && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isSelectedAsKeep ? 'default' : 'outline'}
            className={cn(
              'gap-1',
              isSelectedAsKeep && 'bg-dynamic-green hover:bg-dynamic-green/90'
            )}
            onClick={onSelectKeep}
          >
            {t('duplicates.keep')}
          </Button>
          <Button
            size="sm"
            variant={isSelectedAsDelete ? 'destructive' : 'outline'}
            onClick={onSelectDelete}
          >
            {t('duplicates.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}
