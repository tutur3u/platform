import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { GraduationCap, Hash, Plus, User } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { zodResolver } from '@ncthub/ui/resolvers';
import { cn } from '@ncthub/utils/format';
import { z } from 'zod';

const studentFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  studentNumber: z.string().min(1, 'Student number is required'),
  program: z.string().optional(),
});

export type StudentFormData = z.infer<typeof studentFormSchema>;

interface StudentFormProps {
  values?: StudentFormData;
  onSubmit: (data: StudentFormData) => void;
}

export default function StudentForm({ values, onSubmit }: StudentFormProps) {
  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    values: {
      name: values?.name || '',
      studentNumber: values?.studentNumber || '',
      program: values?.program ?? '',
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  const handleSubmit = (data: StudentFormData) => {
    onSubmit(data);
    form.reset({
      name: '',
      studentNumber: '',
      program: '',
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 font-medium text-base">
                  <User className="h-4 w-4 text-dynamic-blue" />
                  Full Name
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter student's full name"
                    className={cn(
                      'h-12 text-base transition-all duration-200',
                      'border-2 focus:border-dynamic-blue focus:ring-4 focus:ring-dynamic-blue/20',
                      form.formState.errors.name &&
                        'border-destructive/40 focus:border-destructive focus:ring-destructive/20'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="studentNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 font-medium text-base">
                  <Hash className="h-4 w-4 text-dynamic-purple" />
                  Student Number
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter student number/ID"
                    className={cn(
                      'h-12 text-base transition-all duration-200',
                      'border-2 focus:border-dynamic-purple focus:ring-4 focus:ring-dynamic-purple/20',
                      form.formState.errors.studentNumber &&
                        'border-destructive/40 focus:border-destructive focus:ring-destructive/20'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="program"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 font-medium text-base">
                  <GraduationCap className="h-4 w-4 text-dynamic-green" />
                  Program
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter program name"
                    className={cn(
                      'h-12 text-base transition-all duration-200',
                      'border-2 focus:border-dynamic-green focus:ring-4 focus:ring-dynamic-green/20'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className={cn(
            'h-14 w-full font-medium text-base transition-all duration-200',
            'bg-linear-to-r from-dynamic-blue to-dynamic-purple text-primary-foreground hover:opacity-90',
            'shadow-lg hover:shadow-xl'
          )}
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></div>
              Adding Student...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-5 w-5" />
              Add Student
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
