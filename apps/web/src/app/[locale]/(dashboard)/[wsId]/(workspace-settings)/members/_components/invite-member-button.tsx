'use client';

import { UserPlus } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  currentUser?: User;
  canManageMembers?: boolean;
  label?: string;
  variant?: 'outline';
  disabled?: boolean;
}

const FormSchema = z.object({
  wsId: z.string().uuid(),
  email: z.email(),
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
  const t = useTranslations();

  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      wsId,
      email: '',
    },
  });

  const inviteMember = async (values: z.infer<typeof FormSchema>) => {
    const res = await fetch(`/api/workspaces/${wsId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify(values),
    });

    if (res.ok) {
      toast.success(t('ws-members.invitation-sent'), {
        description: t('ws-members.invitation-sent-description', {
          email: values.email,
        }),
      });
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();

      // Handle seat limit reached error with actionable toast
      if (data.errorCode === 'SEAT_LIMIT_REACHED') {
        toast.error(t('ws-members.seat-limit-reached'), {
          description: t('ws-members.seat-limit-reached-description'),
          action: {
            label: t('ws-members.manage-billing'),
            onClick: () => router.push(`/${wsId}/billing`),
          },
          duration: 10000,
        });
      } else {
        toast.error(t('ws-members.invitation-failed'), {
          description:
            data.message || t('ws-members.invitation-failed-description'),
        });
      }
    }
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
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Invite a member to your workspace.
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="username@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full">
                Invite Member
              </Button>
            </form>
          </Form>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
            <p className="text-center text-muted-foreground">
              You do not have permission to invite members.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
