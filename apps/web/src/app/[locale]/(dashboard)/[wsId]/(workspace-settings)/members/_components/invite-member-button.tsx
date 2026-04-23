'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from '@tuturuuu/icons';
import { inviteWorkspaceMember } from '@tuturuuu/internal-api/workspaces';
import type { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { workspaceMembersKeys } from './members-queries';

interface Props {
  wsId: string;
  currentUser?: User;
  canManageMembers?: boolean;
  label?: string;
  variant?: 'outline';
  disabled?: boolean;
}

const FormSchema = z.object({
  wsId: z.guid(),
  email: z.email(),
  memberType: z.enum(['MEMBER', 'GUEST']),
});

export default function InviteMemberButton({
  wsId,
  currentUser,
  canManageMembers,
  label,
  variant,
  disabled,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('ws-members');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      wsId,
      email: '',
      memberType: 'MEMBER' as const,
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (values: z.infer<typeof FormSchema>) =>
      inviteWorkspaceMember(wsId, {
        email: values.email,
        memberType: values.memberType,
      }),
    onSuccess: (_data, values) => {
      toast.success(t('invitation-sent'), {
        description: t('invitation-sent-description', {
          email: values.email,
        }),
      });
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: workspaceMembersKeys.lists(),
      });
    },
    onError: (error: Error & { errorCode?: string }) => {
      if (error.errorCode === 'SEAT_LIMIT_REACHED') {
        toast.error(t('seat-limit-reached'), {
          description: t('seat-limit-reached-description'),
          action: {
            label: t('manage-billing'),
            onClick: () => router.push(`/${wsId}/billing`),
          },
          duration: 10000,
        });
        return;
      }

      toast.error(t('invitation-failed'), {
        description: error.message || t('invitation-failed-description'),
      });
    },
  });

  const inviteMember = async (values: z.infer<typeof FormSchema>) => {
    await inviteMutation.mutateAsync(values);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (open) form.reset();
        setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={variant}
          className="w-full md:w-auto"
          disabled={!wsId || !currentUser || disabled}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invite_dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('invite_dialog_description')}
          </DialogDescription>
        </DialogHeader>

        {canManageMembers ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(inviteMember)}
              className="space-y-3"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('invite_email_label')}</FormLabel>
                    <FormControl>
                      <Input placeholder="username@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="memberType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('invite_membership_label')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MEMBER">
                          {t('invite_membership_member')}
                        </SelectItem>
                        <SelectItem value="GUEST">
                          {t('invite_membership_guest')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full">
                {inviteMutation.isPending
                  ? tCommon('loading')
                  : t('invite_submit')}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
            <p className="text-center text-muted-foreground">
              {t('invite_no_permission')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
