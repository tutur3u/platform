'use client';

import { Circle, Dices, Loader2 } from '@tuturuuu/icons';
import type { UpsertWorkspaceCourseModuleGroupPayload } from '@tuturuuu/internal-api';
import type { WorkspaceCourseModuleGroup } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import IconPicker, {
  getIconComponentByKey,
} from '@tuturuuu/ui/custom/icon-picker';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as z from 'zod';

interface ModuleGroupFormProps {
  data?: WorkspaceCourseModuleGroup;
  onFinish?: () => void;
  onSubmit: (
    payload: UpsertWorkspaceCourseModuleGroupPayload
  ) => Promise<unknown>;
}

const FormSchema = z.object({
  title: z.string().trim().min(1).max(255),
  icon: z.string().trim().max(255).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});

const CREATE_MULTIPLE_KEY = 'module-group-create-multiple';

function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = Math.floor(Math.random() * 40) + 50; // 50-90%
  const lightness = Math.floor(Math.random() * 30) + 40; // 40-70%

  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function ModuleGroupForm({
  data,
  onFinish,
  onSubmit,
}: ModuleGroupFormProps) {
  const t = useTranslations('ws-course-modules');
  const tc = useTranslations('common');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createMultiple, setCreateMultiple] = useLocalStorage(
    CREATE_MULTIPLE_KEY,
    false
  );

  const [localIcon, setLocalIcon] = useState<string>(data?.icon ?? '');
  const [localColor, setLocalColor] = useState<string>(
    data?.color ?? '#64748b'
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: data?.title ?? '',
      icon: data?.icon ?? '',
      color: data?.color ?? '#64748b',
    },
  });

  const isEditing = Boolean(data?.id);

  useEffect(() => {
    const nextIcon = data?.icon ?? '';
    const nextColor = data?.color ?? '#64748b';
    const nextTitle = data?.title ?? '';
    const currentValues = form.getValues();

    if (form.formState.isDirty) {
      return;
    }

    if (
      currentValues.title === nextTitle &&
      currentValues.icon === nextIcon &&
      currentValues.color === nextColor
    ) {
      return;
    }

    setLocalIcon(nextIcon);
    setLocalColor(nextColor);
    form.reset({
      title: nextTitle,
      icon: nextIcon,
      color: nextColor,
    });
  }, [data?.color, data?.icon, data?.title, form]);

  const resetForm = useCallback(() => {
    const defaultColor = '#64748b';
    setLocalIcon('');
    setLocalColor(defaultColor);
    form.reset({
      title: '',
      icon: '',
      color: defaultColor,
    });
  }, [form]);

  const handleIconChange = useCallback(
    (value: string | null) => {
      const newValue = value ?? '';
      setLocalIcon(newValue);
      form.setValue('icon', newValue, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [form]
  );

  const handleColorChange = useCallback(
    (value: string) => {
      setLocalColor(value);
      form.setValue('color', value, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [form]
  );

  const handleRandomizeColor = useCallback(() => {
    const newColor = generateRandomColor();
    setLocalColor(newColor);
    form.setValue('color', newColor, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }, [form]);

  const handleSubmit = useCallback(
    async (values: z.infer<typeof FormSchema>) => {
      setIsSubmitting(true);
      try {
        await onSubmit({
          title: values.title,
          icon:
            isEditing && values.icon === '' ? null : values.icon || undefined,
          color: values.color?.toLowerCase(),
        });

        if (isEditing || !createMultiple) {
          resetForm();
          onFinish?.();
        } else {
          resetForm();
        }
      } catch {
        // error handled by parent hook toast
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSubmit, onFinish, isEditing, createMultiple, resetForm]
  );

  const CurrentIcon = useMemo(() => {
    return getIconComponentByKey(localIcon) ?? Circle;
  }, [localIcon]);

  const iconPickerStyles = useMemo(() => {
    const colorStyles = computeAccessibleLabelStyles(localColor || '#64748b');
    if (!colorStyles) return undefined;
    return {
      backgroundColor: colorStyles.bg,
      borderColor: colorStyles.border,
      color: colorStyles.text,
    } as React.CSSProperties;
  }, [localColor]);

  return (
    <Form {...form}>
      <form className="grid gap-3" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('group_title')}</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="off" disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="icon"
            render={() => (
              <FormItem>
                <FormLabel>{t('group_icon')}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <IconPicker
                      value={localIcon}
                      onValueChange={handleIconChange}
                      allowClear
                      title={t('select_icon')}
                      description={t('icon_description')}
                      searchPlaceholder={t('search_icons')}
                      clearLabel={tc('clear')}
                      triggerStyle={iconPickerStyles}
                      renderIcon={<CurrentIcon className="h-4 w-4" />}
                      disabled={isSubmitting}
                    />
                    <span className="text-muted-foreground text-sm">
                      {localIcon || t('no_icon')}
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="color"
            render={() => (
              <FormItem>
                <FormLabel>{t('group_color')}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <ColorPicker
                      value={localColor || '#64748b'}
                      onChange={handleColorChange}
                      disabled={isSubmitting}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleRandomizeColor}
                            disabled={isSubmitting}
                            className="h-10 w-10 shrink-0"
                          >
                            <Dices className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('randomize_color')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-muted-foreground text-sm">
                      {localColor || t('no_color')}
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <Switch
              id="create-multiple"
              checked={createMultiple}
              onCheckedChange={setCreateMultiple}
              disabled={isSubmitting}
            />
            <label
              htmlFor="create-multiple"
              className="cursor-pointer text-muted-foreground text-sm"
            >
              {t('create_multiple')}
            </label>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {data ? t('edit_group') : t('create_group')}
        </Button>
      </form>
    </Form>
  );
}
