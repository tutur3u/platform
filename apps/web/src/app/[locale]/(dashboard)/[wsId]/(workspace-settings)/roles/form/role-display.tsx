import { BadgeCheck, Info, ShieldAlert, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import type { SectionProps } from './index';

export default function RoleFormDisplaySection({ form, roleId }: SectionProps) {
  const t = useTranslations();
  const roleName = form.watch('name');

  return (
    <div className="space-y-6">
      {/* Role Overview Card */}
      <div className="space-y-4 rounded-lg border bg-linear-to-br from-background via-background to-foreground/2 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
            <BadgeCheck className="h-7 w-7 text-background" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="font-semibold text-base">
              {roleId ? t('ws-roles.edit') : t('ws-roles.create')}
            </Label>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {roleId
                ? t('ws-roles.edit_role_description')
                : t('ws-roles.create_role_description')}
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="flex gap-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-blue" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-dynamic-blue">
              {t('ws-roles.role_info_title')}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t('ws-roles.role_info_description')}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Role Name Input */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <ShieldAlert className="h-4 w-4" />
            {t('ws-roles.role_details')}
          </Label>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">
                {t('ws-roles.name')} <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={t('ws-roles.name_placeholder')}
                  autoComplete="off"
                  className="h-11 text-base"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('ws-roles.name_description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator />

      {/* Preview Card */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2 font-semibold text-base">
          <Users className="h-4 w-4" />
          {t('ws-roles.preview')}
        </Label>

        <div className="rounded-lg border bg-muted/30 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="h-8 px-3 font-semibold text-base"
                >
                  {roleName || t('ws-roles.unnamed_role')}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {t('ws-roles.preview_description')}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background shadow-sm">
              <BadgeCheck className="h-6 w-6 text-dynamic-blue" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
