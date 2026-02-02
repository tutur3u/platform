'use client';

import { Check, Link, Link2Off, Mail, Phone, User } from '@tuturuuu/icons';
import type {
  DuplicateCluster,
  DuplicateUser,
} from '@tuturuuu/types/primitives';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface Props {
  cluster: DuplicateCluster;
  selectedTargetId: string;
  onTargetChange: (targetId: string) => void;
}

export function DuplicateClusterCard({
  cluster,
  selectedTargetId,
  onTargetChange,
}: Props) {
  const t = useTranslations('ws-users');

  const getMatchReasonLabel = (reason: string) => {
    switch (reason) {
      case 'email':
        return t('duplicate_match_email');
      case 'phone':
        return t('duplicate_match_phone');
      case 'both':
        return t('duplicate_match_both');
      default:
        return reason;
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-medium text-base">
            {t('duplicate_cluster')} #{cluster.clusterId}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {getMatchReasonLabel(cluster.matchReason)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t('duplicate_select_target')}
        </p>

        <RadioGroup
          value={selectedTargetId}
          onValueChange={onTargetChange}
          className="space-y-2"
        >
          {cluster.users.map((user) => (
            <DuplicateUserRow
              key={user.id}
              user={user}
              isSelected={selectedTargetId === user.id}
              isSuggested={cluster.suggestedTargetId === user.id}
            />
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

interface DuplicateUserRowProps {
  user: DuplicateUser;
  isSelected: boolean;
  isSuggested: boolean;
}

function DuplicateUserRow({
  user,
  isSelected,
  isSuggested,
}: DuplicateUserRowProps) {
  const t = useTranslations('ws-users');

  const initials = user.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/30'
      )}
    >
      <RadioGroupItem value={user.id} id={user.id} className="mt-1" />
      <Label
        htmlFor={user.id}
        className="flex flex-1 cursor-pointer flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium text-sm">
              {user.fullName || t('duplicate_no_name')}
            </span>
            <div className="flex items-center gap-2">
              {user.isLinked ? (
                <Badge variant="default" className="gap-1 text-xs">
                  <Link className="h-3 w-3" />
                  {t('linked_badge')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Link2Off className="h-3 w-3" />
                  {t('virtual_badge')}
                </Badge>
              )}
              {isSuggested && (
                <Badge
                  variant="secondary"
                  className="gap-1 border-green-500/20 bg-green-500/10 text-green-600 text-xs dark:text-green-400"
                >
                  <Check className="h-3 w-3" />
                  {t('suggested_target')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1 text-muted-foreground text-xs sm:grid-cols-2">
          {user.email && (
            <div className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
          )}
          {user.phone && (
            <div className="flex items-center gap-1 truncate">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.phone}</span>
            </div>
          )}
          {!user.email && !user.phone && (
            <div className="flex items-center gap-1 text-muted-foreground/60">
              <User className="h-3 w-3" />
              <span>{t('duplicate_no_contact')}</span>
            </div>
          )}
        </div>

        <div className="text-muted-foreground text-xs">
          {t('duplicate_created')}:{' '}
          {new Date(user.createdAt).toLocaleDateString()}
        </div>
      </Label>
    </div>
  );
}
