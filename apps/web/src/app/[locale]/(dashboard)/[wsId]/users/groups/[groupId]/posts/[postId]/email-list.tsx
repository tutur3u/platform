'use client';

import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { isEmail } from '@/utils/email-helper';
import { Button } from '@repo/ui/components/ui/button';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Mail } from 'lucide-react';
import { useState } from 'react';

export function EmailList({ users }: { users: WorkspaceUser[] }) {
  const [emailList, setEmailList] = useState<WorkspaceUser[]>(
    users.filter(
      (user) =>
        user.email && isEmail(user.email) && !user.email.endsWith('@easy.com')
    )
  );

  return (
    <Dialog>
      <DialogTrigger asChild disabled>
        <Button disabled>
          <Mail className="mr-1" />
          Send Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          <DialogDescription>
            Choose the users you want to send an email to.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-fit w-full p-2 px-3">
          <div className="flex max-h-48 flex-col gap-4 py-4">
            {users
              // sort disabled users to the end
              .sort((a) =>
                !a.email || !isEmail(a.email) || a.email.endsWith('@easy.com')
                  ? 1
                  : -1
              )
              .map((user) => (
                <div key={user.id} className="flex items-center gap-2">
                  <Checkbox
                    id={user.id}
                    checked={emailList.includes(user)}
                    onCheckedChange={(checked) =>
                      setEmailList((prev) =>
                        checked
                          ? [...prev, user]
                          : prev.filter((u) => u.id !== user.id)
                      )
                    }
                    disabled={
                      !user.email ||
                      !isEmail(user.email) ||
                      user.email.endsWith('@easy.com')
                    }
                  />
                  <label
                    htmlFor={user.id}
                    className="line-clamp-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {user.email}
                  </label>
                </div>
              ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="submit">
            <Mail className="mr-1" />
            Send Emails
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
