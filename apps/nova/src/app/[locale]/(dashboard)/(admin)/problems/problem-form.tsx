'use client';

import { NovaChallenge } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Plus, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as z from 'zod';

// Define the form schema with Zod
const testCaseSchema = z.object({
  id: z.string().optional(),
  input: z.string().min(1, 'Input is required'),
});

const formSchema = z
  .object({
    title: z.string().min(3, {
      message: 'Title must be at least 3 characters.',
    }),
    description: z.string().min(10, {
      message: 'Description must be at least 10 characters.',
    }),
    maxPromptLength: z.coerce
      .number()
      .min(1, {
        message: 'Max prompt length must be at least 1.',
      })
      .default(1000),
    exampleInput: z.string().min(1, {
      message: 'Example input is required.',
    }),
    exampleOutput: z.string().min(1, {
      message: 'Example output is required.',
    }),
    challengeId: z.string().nonempty('Challenge is required'),
    testcases: z
      .array(testCaseSchema)
      .min(1, 'At least one test case is required'),
  })
  .required();

export type ProblemFormValues = z.infer<typeof formSchema>;

interface ProblemFormProps {
  problemId?: string;
  defaultValues?: Partial<ProblemFormValues>;
  onSubmit: (values: ProblemFormValues) => void;
  isSubmitting: boolean;
}

export default function ProblemForm({
  problemId,
  defaultValues,
  onSubmit,
  isSubmitting,
}: ProblemFormProps) {
  const isEditing = !!problemId;

  const [challenges, setChallenges] = useState<NovaChallenge[]>([]);

  // Initialize form with default values
  const form = useForm<ProblemFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // Add a new test case
  const addTestCase = () => {
    const currentTestcases = form.getValues('testcases');
    form.setValue('testcases', [...currentTestcases, { input: '' }]);
  };

  // Remove a test case
  const removeTestCase = (index: number) => {
    const currentTestcases = form.getValues('testcases');
    const updatedTestcases = currentTestcases.filter((_, i) => i !== index);
    form.setValue('testcases', updatedTestcases);
  };

  useEffect(() => {
    // Fetch available challenges
    const fetchChallenges = async () => {
      const response = await fetch('/api/v1/challenges');
      if (!response.ok) {
        toast({
          title: 'Error',
          description: 'Failed to load challenges',
          variant: 'destructive',
        });
        return;
      }

      const data = await response.json();
      setChallenges(data);
    };

    fetchChallenges();
  }, []);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="testcases">Test Cases</TabsTrigger>
          </TabsList>
          <ScrollArea className="h-[500px]">
            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Problem Details</CardTitle>
                  <CardDescription>
                    Enter the details for your problem.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter problem title" {...field} />
                        </FormControl>
                        <FormDescription>
                          The title of your problem. Make it clear and concise.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter problem description"
                            className="min-h-[150px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Describe the problem in detail. Include clear
                          instructions for solving it.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="maxPromptLength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Prompt Length</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormDescription>
                            Maximum allowed length for the prompt in characters.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="challengeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Challenge</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(value) =>
                              field.onChange(value === '' ? null : value)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a challenge" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {challenges.map((challenge) => (
                                <SelectItem
                                  key={challenge.id}
                                  value={challenge.id}
                                >
                                  {challenge.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Associate this problem with a challenge.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="exampleInput"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Example Input</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter example input"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Provide an example input to help users understand the
                          problem.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="exampleOutput"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Example Output</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter example output"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Provide the expected output for the example input.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testcases">
              <Card>
                <CardHeader>
                  <CardTitle>Test Cases</CardTitle>
                  <CardDescription>
                    Add test cases for evaluating solutions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {form.watch('testcases').length > 0 ? (
                    form.watch('testcases').map((testCase, index) => (
                      <div
                        key={testCase.id || index}
                        className="space-y-4 rounded-md border p-4"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Test Case {index + 1}</h3>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTestCase(index)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name={`testcases.${index}.input`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Input</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter test case input"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No test cases added yet.
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addTestCase}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Test Case
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isEditing ? 'Update Problem' : 'Create Problem'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
