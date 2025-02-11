'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { User } from '@tutur3u/types/primitives/User';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tutur3u/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  currentUser?: User;
  label?: string;
  variant?: 'outline';
  disabled?: boolean;
}

const FormSchema = z.object({
  wsId: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  accessLevel: z.enum(['MEMBER', 'ADMIN', 'OWNER']),
});

export default function InviteMemberButton({
  wsId,
  currentUser,
  label,
  variant,
  disabled,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      wsId: wsId,
      email: '',
      role: '',
      accessLevel: 'MEMBER',
    },
  });

  const inviteMember = async (values: z.infer<typeof FormSchema>) => {
    const res = await fetch(`/api/workspaces/${wsId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify(values),
    });

    if (res.ok) {
      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${values.email}.`,
      });
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast({ title: 'Failed to invite member', description: data.message });
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

        {currentUser?.role !== 'MEMBER' ? (
          <>
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

                <Separator />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace Role</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Graphic Designer, Marketing Manager, etc."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        The role of the member in the workspace is only for
                        display purposes and does not affect workspace
                        permissions.
                      </FormDescription>
                    </FormItem>
                  )}
                  disabled={currentUser?.role === 'ADMIN'}
                />

                {/* <Separator />

                <FormField
                  control={form.control}
                  name="accessLevel"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Access Level</FormLabel>
                      <FormControl>
                        <SelectField
                          id="access-level"
                          placeholder="Select an access level"
                          defaultValue={field.value}
                          onValueChange={field.onChange}
                          options={
                            currentUser?.role === 'OWNER'
                              ? [
                                  { value: 'MEMBER', label: 'Member' },
                                  { value: 'ADMIN', label: 'Admin' },
                                  {
                                    value: 'OWNER',
                                    label: 'Owner',
                                  },
                                ]
                              : [
                                  { value: 'MEMBER', label: 'Member' },
                                  { value: 'ADMIN', label: 'Admin' },
                                ]
                          }
                          classNames={{ root: 'w-full' }}
                          disabled={currentUser?.role === 'MEMBER'}
                        />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        This will affect the member&apos;s permissions in the
                        workspace.
                      </FormDescription>
                    </FormItem>
                  )}
                /> */}

                <Button type="submit" className="w-full">
                  Invite Member
                </Button>
              </form>
            </Form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
            <p className="text-center text-muted-foreground">
              You must be an admin or higher to invite members.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
