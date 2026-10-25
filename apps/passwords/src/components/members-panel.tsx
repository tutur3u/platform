import { UserPlus } from '@tuturuuu/icons';
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
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useState } from 'react';
import { useI18n } from '../i18n/provider';
import type { PasswordsClientError } from '../service/client-error';
import { setMember } from '../service/functions';
import type { VaultDetail, VaultRole } from '../service/port';
import { RoleSelect } from './role-select';
import { StepUpNotice } from './step-up-notice';
import { useGuardedMutation } from './use-guarded-mutation';

interface Props {
  wsId: string;
  vault: VaultDetail;
  stepUpUrl: string;
}

interface MemberArgs {
  userId: string;
  role: VaultRole;
  revoked: boolean;
}

export function MembersPanel({ wsId, vault, stepUpUrl }: Props) {
  const { t } = useI18n();
  const [stepUp, setStepUp] = useState<string | null>(null);
  const [candidate, setCandidate] = useState('');
  const [role, setRole] = useState<VaultRole>('viewer');
  const known = new Set(vault.members.map((member) => member.userId));
  const options = vault.workspaceMembers.filter(
    (option) => !known.has(option.userId)
  );
  const name = (displayName: string | null) =>
    displayName ?? t('common.unknownUser');

  const save = useGuardedMutation({
    write: { wsId, vaultId: vault.summary.id, action: 'member.set' },
    intent: ({ userId, role, revoked }: MemberArgs) =>
      `${userId}:${role}:${revoked}`,
    run: (args, requestId) =>
      setMember({
        data: {
          wsId,
          vaultId: vault.summary.id,
          revision: vault.summary.revision,
          requestId,
          ...args,
        },
      }),
    onSuccess: () => {
      setStepUp(null);
      toast.success(t('members.saved'));
    },
  });
  const apply = (args: MemberArgs) =>
    save.mutate(args, {
      onError: (error: PasswordsClientError) =>
        setStepUp(
          error.code === 'STEP_UP_REQUIRED'
            ? (error.stepUpUrl ?? stepUpUrl)
            : null
        ),
    });

  return (
    <div className="grid gap-4">
      {stepUp && <StepUpNotice url={stepUp} />}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={candidate} onValueChange={setCandidate}>
          <SelectTrigger className="w-64" aria-label={t('members.pick')}>
            <SelectValue placeholder={t('members.pick')} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.userId} value={option.userId}>
                {name(option.displayName)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RoleSelect value={role} onChange={setRole} label={t('members.role')} />
        <Button
          size="sm"
          disabled={!candidate || save.isPending}
          onClick={() => {
            apply({ userId: candidate, role, revoked: false });
            setCandidate('');
          }}
        >
          <UserPlus className="h-4 w-4" />
          {t('members.add')}
        </Button>
      </div>
      {vault.members.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          {t('members.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('members.member')}</TableHead>
              <TableHead>{t('members.role')}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vault.members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="font-medium">
                  {name(member.displayName)}
                  {member.revoked && (
                    <Badge variant="destructive" className="ml-2">
                      {t('members.revoked')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <RoleSelect
                    value={member.role}
                    label={t('members.role')}
                    disabled={member.revoked || save.isPending}
                    onChange={(next) =>
                      apply({
                        userId: member.userId,
                        role: next,
                        revoked: false,
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  {member.revoked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        apply({
                          userId: member.userId,
                          role: member.role,
                          revoked: false,
                        })
                      }
                    >
                      {t('members.restore')}
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          {t('members.revoke')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('members.revokeTitle', {
                              name: name(member.displayName),
                            })}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('members.revokeBody')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              apply({
                                userId: member.userId,
                                role: member.role,
                                revoked: true,
                              })
                            }
                          >
                            {t('members.revoke')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
