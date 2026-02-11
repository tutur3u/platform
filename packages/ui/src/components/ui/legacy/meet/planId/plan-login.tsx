'use client';

import { guestLogin } from '@tuturuuu/apis/meet/actions';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

const formSchema = z.object({
  guestName: z.string().min(1).max(255),
  guestPassword: z.string().max(255).optional(),
  saveCredentials: z.boolean().default(true),
});

const GUEST_CREDENTIALS_KEY_PREFIX = 'meet_together_guest_';

export default function PlanLogin({
  plan,
  baseUrl,
}: {
  plan: MeetTogetherPlan;
  baseUrl: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const t = useTranslations();

  const { user, originalPlatformUser, displayMode, setUser, setDisplayMode } =
    useTimeBlocking();

  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guestName: user?.display_name ?? '',
      guestPassword: '',
      saveCredentials: true,
    },
  });

  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {
      if (!plan.id) return;

      setLoading(true);

      const result = await guestLogin(plan.id, {
        name: values.guestName,
        password: values.guestPassword || '',
      });

      if (result.data) {
        // Save credentials to localStorage if checkbox is checked
        if (values.saveCredentials) {
          try {
            localStorage.setItem(
              `${GUEST_CREDENTIALS_KEY_PREFIX}${plan.id}`,
              JSON.stringify({
                name: values.guestName,
                password: values.guestPassword,
              })
            );
          } catch (error) {
            console.error('Failed to save credentials', error);
          }
        } else {
          // If checkbox is unchecked, clear any previously saved credentials
          try {
            localStorage.removeItem(
              `${GUEST_CREDENTIALS_KEY_PREFIX}${plan.id}`
            );
          } catch (error) {
            console.error('Failed to remove credentials', error);
          }
        }

        setUser(plan.id, result.data.user);
        setLoading(false);
        setDisplayMode();
      } else {
        form.setValue('guestPassword', '');
        form.setError('guestPassword', { message: result.error });
        setLoading(false);
      }
    },
    [plan.id, form, setUser, setDisplayMode]
  );

  // Try to load saved credentials from localStorage on component mount
  useEffect(() => {
    if (!plan.id || user) return;

    try {
      const savedCredentialsJSON = localStorage.getItem(
        `${GUEST_CREDENTIALS_KEY_PREFIX}${plan.id}`
      );
      if (savedCredentialsJSON) {
        const savedCredentials = JSON.parse(savedCredentialsJSON);
        form.setValue('guestName', savedCredentials.name || '');
        form.setValue('guestPassword', savedCredentials.password || '');

        // Auto login if we have saved credentials
        if (savedCredentials.name) {
          onSubmit({
            guestName: savedCredentials.name,
            guestPassword: savedCredentials.password || '',
            saveCredentials: true,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load saved credentials', error);
    }
  }, [plan.id, form, user, onSubmit]);

  const handleLogout = () => {
    if (!plan.id) return;

    // Clear saved credentials if they exist
    try {
      localStorage.removeItem(`${GUEST_CREDENTIALS_KEY_PREFIX}${plan.id}`);
    } catch (error) {
      console.error('Failed to remove credentials', error);
    }

    // Clear the user state
    setUser(plan.id, null);
    setDisplayMode();
  };

  const missingFields = !form.watch('guestName');

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
            {user?.is_guest ? (
              <>
                <div className="mb-2 text-muted-foreground text-sm">
                  {t('meet-together-plan-details.logged_in_as')}{' '}
                  <span className="font-semibold text-foreground">
                    {user.display_name}
                  </span>
                  .
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleLogout}
                >
                  {t('common.logout')}
                </Button>
                <Separator className="my-2" />
              </>
            ) : null}
            <Button
              className="w-full"
              onClick={() => {
                if (!plan.id) return;

                if (!originalPlatformUser) {
                  router.push(
                    `${baseUrl}/login?nextUrl=${encodeURIComponent(pathname)}`
                  );
                  return;
                }

                setUser(plan.id, originalPlatformUser);
                setDisplayMode();
              }}
              disabled={
                !plan.id ||
                (!!originalPlatformUser &&
                  (!user?.id || originalPlatformUser?.id === user?.id))
              }
            >
              {!!originalPlatformUser &&
              (!user?.id || originalPlatformUser?.id === user?.id)
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
                      <Input
                        placeholder="Tuturuuu"
                        disabled={loading}
                        autoComplete="off"
                        autoCorrect="off"
                        autoFocus
                        {...field}
                      />
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
                        disabled={missingFields || loading}
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

              <FormField
                control={form.control}
                name="saveCredentials"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        {t('meet-together-plan-details.save_credentials')}
                      </FormLabel>
                      <FormDescription>
                        {t('meet-together-plan-details.save_credentials_desc')}
                      </FormDescription>
                    </div>
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
