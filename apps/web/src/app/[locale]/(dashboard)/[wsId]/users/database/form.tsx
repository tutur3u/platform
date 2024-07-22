'use client';

import { DatePicker } from '@/components/row-actions/users/date-picker';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { getInitials } from '@/utils/name-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { SelectField } from '@repo/ui/components/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import { toast } from '@repo/ui/hooks/use-toast';
import dayjs from 'dayjs';
import { UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: WorkspaceUser;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  full_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.date().optional(),
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
});

export default function UserForm({ wsId, data, onFinish }: Props) {
  // const t = useTranslations('ws-user-group-tags');
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      full_name: data?.full_name || '',
      display_name: data?.display_name || '',
      email: data?.email || undefined,
      phone: data?.phone || '',
      gender: data?.gender?.toLocaleUpperCase() as
        | 'MALE'
        | 'FEMALE'
        | 'OTHER'
        | undefined,
      birthday: data?.birthday ? new Date(data.birthday) : undefined,
      ethnicity: data?.ethnicity || '',
      guardian: data?.guardian || '',
      national_id: data?.national_id || '',
      address: data?.address || '',
      note: data?.note || '',
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/users/${data.id}`
          : `/api/v1/workspaces/${wsId}/users`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...data,
            birthday: dayjs(data.birthday).format('YYYY-MM-DD'),
          }),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const name = form.watch('display_name') || form.watch('full_name');

  return (
    <>
      <div className="mb-2 flex items-center gap-2 rounded-md border p-4">
        <Avatar>
          <AvatarImage src={data?.avatar_url || undefined} />
          <AvatarFallback className="font-semibold">
            {name ? getInitials(name) : <UserIcon className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-1">
          <p className="line-clamp-1 text-sm font-medium leading-none">
            {name ? name : <span className="opacity-50">Unknown</span>}{' '}
          </p>

          <p className="text-foreground/60 line-clamp-1 text-sm">
            {data?.email ||
              (data?.handle
                ? `@${data.handle}`
                : data?.id?.replace(/-/g, '') || form.watch('email'))}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
          <ScrollArea className="grid h-[50vh] gap-3 border-b">
            {data?.id && (
              <>
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User ID</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        The identification number of this user in your
                        workspace. This is automatically managed by Tuturuuu,
                        and cannot be changed.
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <Separator />
              </>
            )}

            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>The real name of this user.</FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    This name will be displayed everywhere in the current
                    workspace for this user.
                  </FormDescription>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="example@tuturuuu.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+123456789" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Gender</FormLabel>
                  <FormControl>
                    <SelectField
                      id="gender"
                      placeholder="Please select a gender"
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      options={[
                        {
                          value: 'MALE',
                          label: 'Male',
                        },
                        {
                          value: 'FEMALE',
                          label: 'Female',
                        },
                        {
                          value: 'OTHER',
                          label: 'Other',
                        },
                      ]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthday"
              render={({ field }) => (
                <FormItem className="grid w-full">
                  <FormLabel>Birthday</FormLabel>
                  <FormControl>
                    <DatePicker
                      defaultValue={
                        field.value ? dayjs(field.value).toDate() : undefined
                      }
                      onValueChange={field.onChange}
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="national_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Empty" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ethnicity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ethnicity</FormLabel>
                  <FormControl>
                    <Input placeholder="Empty" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guardian"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guardian</FormLabel>
                  <FormControl>
                    <Input placeholder="Empty" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Empty" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Empty" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ScrollArea>

          <div className="flex justify-center gap-2">
            <Button type="submit" className="w-full">
              Save changes
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
