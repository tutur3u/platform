'use client';

import type { WorkspaceCourse } from '@tuturuuu/types/db';
import { Constants } from '@tuturuuu/types/supabase';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { Alert, AlertDescription, AlertTitle } from '../../../alert';

interface Props {
  enableCerts?: boolean;
  wsId: string;
  data?: WorkspaceCourse & { description?: string }; // Add description property
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

// Create dynamic enum from Constants for future extensibility
const certificateTemplateOptions = Constants.public.Enums.certificate_templates;
type CertificateTemplate = (typeof certificateTemplateOptions)[number];

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  cert_template: z
    .enum([...certificateTemplateOptions] as [
      CertificateTemplate,
      ...CertificateTemplate[],
    ])
    .default('original'),
});

export function CourseForm({
  wsId,
  data,
  onFinish,
  enableCerts = false,
}: Props) {
  const t = useTranslations('ws-courses');
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(true);
  const locale = useLocale();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      description: data?.description || '',
      cert_template: (data?.cert_template as CertificateTemplate) || 'original',
    },
  });

  // Only watch the cert_template field instead of all form values
  const certTemplate = form.watch('cert_template');

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, []);

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/courses/${data.id}`
          : `/api/v1/workspaces/${wsId}/courses`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} course`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} course`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div
      className={cn(
        enableCerts && showPreview
          ? 'grid grid-cols-1 gap-6 lg:grid-cols-4'
          : 'grid gap-6'
      )}
    >
      {/* Form Section */}
      <div className="">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: true }}
              render={({ field }) => (
                <>
                  <FormItem>
                    <FormLabel>{t('name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('name')}
                        autoComplete="off"
                        required
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>

                  <FormItem>
                    <FormLabel>{t('course_description')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('course_description')}
                        autoComplete="off"
                        {...form.register('description')}
                      />
                    </FormControl>
                  </FormItem>
                </>
              )}
            />
            {enableCerts ? (
              <>
                <FormField
                  control={form.control}
                  name="cert_template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('certificate_template')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t('select_certificate_template')}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {certificateTemplateOptions.map((template) => (
                            <SelectItem key={template} value={template}>
                              {template.charAt(0).toUpperCase() +
                                template.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview Toggle Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full"
                >
                  {showPreview
                    ? t('hide_certificate_preview')
                    : t('show_certificate_preview')}
                </Button>
              </>
            ) : (
              <></>
            )}
            <Button type="submit" className="w-full" disabled={disabled}>
              {data?.id ? t('edit') : t('create')}
            </Button>
          </form>
        </Form>
      </div>

      {/* Preview Section */}
      {enableCerts && showPreview && (
        <div className="col-span-2 col-start-3 flex items-center justify-center">
          <Card className="flex items-center justify-center">
            <CardContent className="flex items-center justify-center p-2">
              {imageError ? (
                <Alert>
                  <AlertTitle>{t('image_preview_not_available')}</AlertTitle>
                  <AlertDescription>
                    {t('image_preview_not_available_description')}
                  </AlertDescription>
                </Alert>
              ) : (
                <Image
                  alt={`${certTemplate} certificate template preview`}
                  width={400}
                  height={300}
                  className="object-contain"
                  onError={() => setImageError(true)}
                  src={`/media/certificate-previews/${locale}/${certTemplate}-preview.png`}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
