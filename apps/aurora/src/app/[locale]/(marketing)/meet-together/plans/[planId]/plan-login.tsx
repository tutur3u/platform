'use client';

import AvailabilityPlanner from './availability-planner';
import { useTimeBlocking } from './time-blocking-provider';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { Timeblock } from '@/types/primitives/Timeblock';
import { User } from '@/types/primitives/User';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
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
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const formSchema = z.object({
  guestName: z.string().min(1).max(255),
  guestPassword: z.string().max(255).optional(),
});

export default function PlanLogin({
  plan,
  timeblocks,
  platformUser,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  platformUser: User | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const t = useTranslations();

  const { user, displayMode, setUser, setDisplayMode } = useTimeBlocking();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guestName: user?.display_name ?? '',
      guestPassword: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!plan.id) return;

    setLoading(true);

    const res = await fetch(`/api/meet-together/plans/${plan.id}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: values.guestName,
        password: values.guestPassword,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setUser(plan.id, data.user);
      setLoading(false);
      setDisplayMode();
    } else {
      const data = await res.json();
      form.setValue('guestPassword', '');
      form.setError('guestPassword', { message: data.message });
      setLoading(false);
    }
  }

  const missingFields = !form.getValues().guestName;

  return (
    <Dialog
      open={!!displayMode}
      onOpenChange={(open) => {
        form.reset();
        setLoading(false);
        setDisplayMode((prevMode) =>
          open ? prevMode || 'account-switcher' : undefined
        );
      }}
    >
      <DialogTrigger asChild={!!user || !!platformUser}>
        <AvailabilityPlanner
          plan={plan}
          timeblocks={timeblocks}
          disabled={!user}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {displayMode === 'account-switcher'
              ? t('meet-together-plan-details.account_switcher')
              : displayMode === 'login'
                ? t('meet-together-plan-details.identity_protection')
                : null}
          </DialogTitle>
          <DialogDescription>
            {displayMode === 'account-switcher'
              ? t('meet-together-plan-details.account_switcher_desc')
              : displayMode === 'login'
                ? t('meet-together-plan-details.identity_protection_desc')
                : null}
          </DialogDescription>
        </DialogHeader>

        {displayMode === 'account-switcher' ? (
          <div className="grid gap-2">
            <Button
              className="w-full"
              onClick={() => {
                if (!plan.id) return;

                if (!platformUser) {
                  router.push(`/login?nextUrl=${encodeURIComponent(pathname)}`);
                  return;
                }

                setUser(plan.id, platformUser);
                setDisplayMode();
              }}
              disabled={
                !plan.id ||
                (!!platformUser && (!user?.id || platformUser?.id === user?.id))
              }
            >
              {!!platformUser && (!user?.id || platformUser?.id === user?.id)
                ? t('meet-together-plan-details.using_tuturuuu_account')
                : t('meet-together-plan-details.use_tuturuuu_account')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setDisplayMode('login');
              }}
            >
              {user?.is_guest
                ? t('meet-together-plan-details.use_other_guest_account')
                : t('meet-together-plan-details.use_guest_account')}
            </Button>
          </div>
        ) : displayMode === 'login' ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="guestName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('meet-together-plan-details.your_name')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Tuturuuu" autoFocus {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('meet-together-plan-details.your_name_desc')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="guestPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('meet-together-plan-details.password')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="••••••••"
                        type="password"
                        disabled={missingFields}
                        autoComplete="off"
                        autoCorrect="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('meet-together-plan-details.password_desc')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={missingFields || loading}
                >
                  {loading ? t('common.processing') : t('common.continue')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
