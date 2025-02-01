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
      <div className="mb-2 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 p-2 text-center font-bold text-dynamic-blue">
        {form.watch('name') || '-'}
      </div>
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
