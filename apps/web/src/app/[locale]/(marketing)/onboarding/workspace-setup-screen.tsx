'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { ArrowLeft, ArrowRight, Building2, Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

const FormSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
});

interface WorkspaceSetupScreenProps {
  onBack: () => void;
  // eslint-disable-next-line no-unused-vars
  onContinue: (data: { name: string }) => void;
  initialData?: {
    name?: string | null;
  };
  loading?: boolean;
}

export function WorkspaceSetupScreen({
  onBack,
  onContinue,
  initialData,
  loading = false,
}: WorkspaceSetupScreenProps) {
  const t = useTranslations('onboarding.workspace-setup');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: initialData?.name || '',
    },
  });

  const handleSubmit = (data: z.infer<typeof FormSchema>) => {
    onContinue({
      name: data.name,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
              <Building2 className="h-8 w-8" />
            </div>

            <h1 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl dark:text-white">
              {t('title')}
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-300">
              {t('subtitle')}
            </p>
          </div>

          {/* Form */}
          <Card className="border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-semibold">
                {t('workspace-details')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleSubmit)}
                  className="space-y-6"
                >
                  {/* Avatar Section */}
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-100 p-1 shadow-md dark:bg-gray-700">
                        <div className="h-full w-full overflow-hidden rounded-full bg-white dark:bg-gray-800">
                          <Image
                            width={80}
                            height={80}
                            src={'/media/logos/light.png'}
                            alt="Workspace avatar"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Workspace Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          {t('workspace-name')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('workspace-name-placeholder')}
                            {...field}
                            disabled={loading}
                            className="h-11 text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tips Section */}
                  <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                    <h4 className="mb-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                      {t('tips.title')}
                    </h4>
                    <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                      <li>{t('tips.tip1')}</li>
                      <li>{t('tips.tip2')}</li>
                      <li>{t('tips.tip3')}</li>
                    </ul>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onBack}
                      disabled={loading}
                      className="border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t('back')}
                    </Button>

                    <Button
                      type="submit"
                      disabled={loading || !form.formState.isValid}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('creating-workspace')}
                        </>
                      ) : (
                        <>
                          {t('continue')}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
