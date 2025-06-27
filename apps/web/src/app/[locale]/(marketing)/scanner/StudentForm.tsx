import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  AlertCircle,
  GraduationCap,
  Hash,
  Plus,
  User,
} from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { cn } from '@ncthub/utils/format';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const studentFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  studentNumber: z.string().min(1, 'Student number is required'),
  program: z.string().optional(),
});

export type StudentFormData = z.infer<typeof studentFormSchema>;

interface StudentFormProps {
  defaultValues?: StudentFormData;
  onSubmit: (data: StudentFormData) => void;
}

export default function StudentForm({
  defaultValues,
  onSubmit,
}: StudentFormProps) {
  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: '',
      studentNumber: '',
      program: '',
      ...defaultValues,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <User className="h-4 w-4 text-blue-500" />
                  Full Name
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter student's full name"
                    className={cn(
                      'h-12 text-base transition-all duration-200',
                      'border-2 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20',
                      form.formState.errors.name &&
                        'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="flex items-center gap-1">
                  {form.formState.errors.name && (
                    <AlertCircle className="h-3 w-3" />
                  )}
                </FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="studentNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <Hash className="h-4 w-4 text-purple-500" />
                  Student Number
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter student number/ID"
                    className={cn(
                      'h-12 text-base transition-all duration-200',
                      'border-2 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20',
                      form.formState.errors.studentNumber &&
                        'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="flex items-center gap-1">
                  {form.formState.errors.studentNumber && (
                    <AlertCircle className="h-3 w-3" />
                  )}
                </FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="program"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2 text-base font-medium">
                  <GraduationCap className="h-4 w-4 text-green-500" />
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
                      'border-2 focus:border-green-500 focus:ring-4 focus:ring-green-500/20'
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
            'h-14 w-full text-base font-medium transition-all duration-200',
            'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700',
            'shadow-lg hover:shadow-xl',
          )}
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
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
