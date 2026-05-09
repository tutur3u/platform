import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import type * as z from 'zod';
import type { UserReportFormSchema } from './editable-report-preview';

export interface UserReportFormProps {
  isNew: boolean;
  form: UseFormReturn<z.infer<typeof UserReportFormSchema>>;
  submitLabel: string;
  onSubmit?: (formData: z.infer<typeof UserReportFormSchema>) => void;
  onDelete?: () => void;
  managerOptions?: Array<{ value: string; label: string }>;
  selectedManagerName?: string;
  onChangeManager?: (name?: string) => void;
  canSubmit?: boolean;
  canDelete?: boolean;
  isSubmitting?: boolean;
  showHeading?: boolean;
  readOnlyMessage?: string;
}
