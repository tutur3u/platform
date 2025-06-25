import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { Input } from '@ncthub/ui/input';
import { Button } from '@ncthub/ui/button';
import { Badge } from '@ncthub/ui/badge';
import {
  User,
  Hash,
  GraduationCap,
  Plus,
  CheckCircle,
  AlertCircle
} from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';

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

export default function StudentForm({ defaultValues, onSubmit }: StudentFormProps) {
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
  const hasDefaultValues = Boolean(defaultValues?.name || defaultValues?.studentNumber);

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      {hasDefaultValues && (
        <div className="flex items-center justify-center">
          <Badge className="bg-green-100 text-green-800 border-green-200 px-4 py-2">
            <CheckCircle className="h-4 w-4 mr-2" />
            Information Detected
          </Badge>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-500" />
                    Full Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter student's full name"
                      className={cn(
                        "h-12 text-base transition-all duration-200",
                        "border-2 focus:border-blue-500 focus:ring-blue-500/20 focus:ring-4",
                        form.formState.errors.name && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="flex items-center gap-1">
                    {form.formState.errors.name && <AlertCircle className="h-3 w-3" />}
                  </FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="studentNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium flex items-center gap-2">
                    <Hash className="h-4 w-4 text-purple-500" />
                    Student Number
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter student number/ID"
                      className={cn(
                        "h-12 text-base transition-all duration-200",
                        "border-2 focus:border-purple-500 focus:ring-purple-500/20 focus:ring-4",
                        form.formState.errors.studentNumber && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="flex items-center gap-1">
                    {form.formState.errors.studentNumber && <AlertCircle className="h-3 w-3" />}
                  </FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="program"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-green-500" />
                    Program
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter program name"
                      className={cn(
                        "h-12 text-base transition-all duration-200",
                        "border-2 focus:border-green-500 focus:ring-green-500/20 focus:ring-4"
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
              "w-full h-14 text-base font-medium transition-all duration-200",
              "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700",
              "shadow-lg hover:shadow-xl",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                Adding Student...
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 mr-2" />
                Add Student
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}