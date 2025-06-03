'use client';

import { calendarEventSchema } from '@ncthub/ai/calendar/events';
import { useObject } from '@ncthub/ai/object/core';
import { Alert, AlertDescription, AlertTitle } from '@ncthub/ui/alert';
import { Button } from '@ncthub/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import { DateTimePicker } from '@ncthub/ui/date-time-picker';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Loader2,
} from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { zodResolver } from '@ncthub/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { Switch } from '@ncthub/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ncthub/ui/tabs';
import { Textarea } from '@ncthub/ui/textarea';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const FormSchema = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
});

export default function Page() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'ai' | 'preview' | 'manual'>('ai');
  const [generatedEvent, setGeneratedEvent] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [userTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      prompt: '',
      timezone: userTimezone,
    },
  });

  const { object, submit, error, isLoading } = useObject({
    api: '/api/v1/calendar/events/generate',
    schema: calendarEventSchema,
  });

  useEffect(() => {
    if (object && !isLoading) {
      setGeneratedEvent(object);
      setActiveTab('preview');
      setGenerating(false);
    }
  }, [object, isLoading]);

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    setGenerating(true);
    try {
      // Include timezone in the prompt for accurate time conversion
      const promptWithTimezone = `${values.prompt} (User timezone: ${values.timezone})`;
      submit({
        prompt: promptWithTimezone,
        current_time: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error generating event:', error);
      toast({
        title: 'Error generating event',
        description: 'Please try again with a different prompt',
        variant: 'destructive',
      });
      setGenerating(false);
    }
  };

  const colorOptions = [
    { value: 'blue', label: 'Blue' },
    { value: 'red', label: 'Red' },
    { value: 'green', label: 'Green' },
    { value: 'yellow', label: 'Yellow' },
    { value: 'purple', label: 'Purple' },
    { value: 'pink', label: 'Pink' },
    { value: 'orange', label: 'Orange' },
    { value: 'gray', label: 'Gray' },
  ];

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold">Create Calendar Event</h1>
        <p className="text-muted-foreground">
          Generate calendar events using AI or create them manually
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value: string) =>
          setActiveTab(value as 'ai' | 'preview' | 'manual')
        }
      >
        <TabsList className="mb-8 grid w-full grid-cols-3">
          <TabsTrigger value="ai">AI Generate</TabsTrigger>
          <TabsTrigger value="preview" disabled={!generatedEvent}>
            Preview
          </TabsTrigger>
          <TabsTrigger value="manual">Manual Input</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI Event Generator</CardTitle>
              <CardDescription>
                Describe your event and we'll create it for you. Include details
                like title, time, location, etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="prompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Meet with James at Starbucks on 5th Avenue next Monday at 10am for coffee"
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Be as specific as possible with dates, times, and
                          locations
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Timezone</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly />
                        </FormControl>
                        <FormDescription>
                          We'll use this to create events in your local time
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        {error.message ||
                          'Failed to generate the event. Please try again with more details.'}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || generating}
                  >
                    {isLoading || generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Event'
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          {generatedEvent && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: generatedEvent.color || 'blue' }}
                  />
                  <CardTitle>{generatedEvent.title}</CardTitle>
                </div>
                <CardDescription>
                  Preview your AI generated event
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Date and Time */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                        Start Time
                      </h3>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="text-muted-foreground h-4 w-4" />
                        <p>
                          {generatedEvent.start_at
                            ? format(new Date(generatedEvent.start_at), 'PPP p')
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                        End Time
                      </h3>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="text-muted-foreground h-4 w-4" />
                        <p>
                          {generatedEvent.end_at
                            ? format(new Date(generatedEvent.end_at), 'PPP p')
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {generatedEvent.is_all_day && (
                      <div className="text-muted-foreground flex items-center gap-2">
                        <span>All day event</span>
                      </div>
                    )}
                  </div>

                  {/* Other Details */}
                  <div className="space-y-4">
                    {generatedEvent.location && (
                      <div>
                        <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                          Location
                        </h3>
                        <p>{generatedEvent.location}</p>
                      </div>
                    )}

                    {generatedEvent.description && (
                      <div>
                        <h3 className="text-muted-foreground mb-1 text-sm font-medium">
                          Description
                        </h3>
                        <p>{generatedEvent.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" onClick={() => setActiveTab('ai')}>
                  Generate Another
                </Button>
                <Button>Save to Calendar</Button>
              </CardFooter>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual Event Creation</CardTitle>
              <CardDescription>
                Create a calendar event by entering the details manually
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <FormLabel>Event Title</FormLabel>
                      <Input placeholder="Meeting with Team" />
                    </div>

                    <div className="space-y-2">
                      <FormLabel>Location</FormLabel>
                      <Input placeholder="Conference Room 3" />
                    </div>

                    <div className="space-y-2">
                      <FormLabel>Color</FormLabel>
                      <Select defaultValue="blue">
                        <SelectTrigger>
                          <SelectValue placeholder="Select a color" />
                        </SelectTrigger>
                        <SelectContent>
                          {colorOptions.map((color) => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: color.value }}
                                />
                                <span>{color.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <FormLabel>All Day</FormLabel>
                        <Switch />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <FormLabel>Start Date & Time</FormLabel>
                      <DateTimePicker
                        date={new Date()}
                        setDate={(date) =>
                          console.log('Start date changed:', date)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <FormLabel>End Date & Time</FormLabel>
                      <DateTimePicker
                        date={new Date(new Date().getTime() + 60 * 60 * 1000)}
                        setDate={(date) =>
                          console.log('End date changed:', date)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel>Description</FormLabel>
                  <Textarea
                    placeholder="Event details and notes"
                    className="min-h-[120px]"
                  />
                </div>

                <div className="space-y-2">
                  <FormLabel>Timezone</FormLabel>
                  <Input value={userTimezone} readOnly />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button className="w-full">Create Event</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
