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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 py-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter student name"
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
              <FormLabel required>Student Number</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter student number"
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
              <FormLabel>Program</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter program (optional)"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="rounded-lg py-2 transition"
          disabled={isSubmitting}
        >
          Add Student
        </Button>
      </form>
    </Form>
  );
}