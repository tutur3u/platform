import { SectionProps } from './index';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { useTranslations } from 'next-intl';

export default function RoleFormDisplaySection({ form }: SectionProps) {
  const t = useTranslations();

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ws-roles.name')}</FormLabel>
            <FormControl>
              <Input placeholder="Name" autoComplete="off" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
