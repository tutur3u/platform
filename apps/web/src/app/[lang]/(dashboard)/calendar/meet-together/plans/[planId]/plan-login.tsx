'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import AvailabilityPlanner from './availability-planner';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { useTimeBlocking } from './time-blocking-provider';
import { User } from '@/types/primitives/User';
import { usePathname, useRouter } from 'next/navigation';
import { Timeblock } from '@/types/primitives/Timeblock';

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

  const { t } = useTranslation('meet-together-plan-details');

  const {
    user,
    showLogin,
    showAccountSwitcher,
    setUser,
    setShowLogin,
    setShowAccountSwitcher,
  } = useTimeBlocking();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guestName: user?.display_name ?? '',
      guestPassword: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
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
      setUser(data.user);
      setLoading(false);
      setShowLogin(false);
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
      open={showLogin}
      onOpenChange={(open) => {
        form.reset();
        setLoading(false);
        setShowAccountSwitcher(open);
        setShowLogin(open);
      }}
    >
      <DialogTrigger asChild={!!user || !!platformUser}>
        <AvailabilityPlanner
          plan={plan}
          timeblocks={timeblocks}
          disabled={!user && !platformUser}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {showAccountSwitcher
              ? t('account_switcher')
              : t('identity_protection')}
          </DialogTitle>
          <DialogDescription>
            {showAccountSwitcher
              ? t('account_switcher_desc')
              : t('identity_protection_desc')}
          </DialogDescription>
        </DialogHeader>

        {showAccountSwitcher ? (
          <div className="grid gap-2">
            <Button
              className="w-full"
              onClick={() => {
                if (!platformUser) {
                  router.push(`/login?nextUrl=${encodeURIComponent(pathname)}`);
                  return;
                }

                setUser(platformUser);
                setShowAccountSwitcher(false);
                setShowLogin(false);
              }}
              disabled={
                !!platformUser && (!user?.id || platformUser?.id === user?.id)
              }
            >
              {!!platformUser && (!user?.id || platformUser?.id === user?.id)
                ? t('using_tuturuuu_account')
                : t('use_tuturuuu_account')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowAccountSwitcher(false);
              }}
            >
              {user?.is_guest
                ? t('use_other_guest_account')
                : t('use_guest_account')}
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="guestName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('your_name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Tuturuuu"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('your_name_desc')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="guestPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('password')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="••••••••"
                        type="password"
                        autoComplete="off"
                        disabled={missingFields}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('password_desc')}</FormDescription>
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
                  {loading ? t('common:processing') : t('common:continue')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
