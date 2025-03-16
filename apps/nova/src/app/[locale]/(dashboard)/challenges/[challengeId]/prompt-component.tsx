import PromptForm from './prompt-form';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Lightbulb, MessageSquare, Sparkles, Target } from 'lucide-react';

interface Problem {
  id: string;
  title: string;
  description: string;
  maxPromptLength: number;
  exampleInput: string;
  exampleOutput: string;
  testcases: string[];
}

export default function PromptComponent({ problem }: { problem: Problem }) {
  return (
    <Card className="h-full w-full overflow-hidden bg-foreground/10 p-4 text-foreground">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">
            Prompt Engineering Challenge
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-full px-0 pb-0">
        <Tabs defaultValue="prompt" className="flex h-full flex-col">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="prompt" className="flex-1 gap-2">
              <MessageSquare className="h-4 w-4" />
              Your Prompt
            </TabsTrigger>
            <TabsTrigger value="tips" className="flex-1 gap-2">
              <Lightbulb className="h-4 w-4" />
              Tips & Hints
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-hidden">
            <TabsContent value="prompt" className="h-full">
              <PromptForm problem={problem} />
            </TabsContent>
            <TabsContent value="tips" className="h-full overflow-y-auto">
              <div className="space-y-6 p-4">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-medium">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Tips for a Great Prompt
                  </h3>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Be specific and clear about what you want</li>
                    <li>Provide context and constraints</li>
                    <li>Break complex tasks into steps</li>
                    <li>Use examples to demonstrate the desired output</li>
                    <li>Consider edge cases and potential issues</li>
                    <li>Review and refine your prompt based on feedback</li>
                  </ul>
                </div>

                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-medium">
                    <Target className="h-5 w-5 text-primary" />
                    Judging Criteria
                  </h3>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Your prompt will be evaluated based on these criteria:
                  </p>
                  <ul className="list-disc space-y-3 pl-5">
                    <li>
                      <strong>Clarity:</strong> Is your prompt clear and
                      unambiguous?
                      <p className="mt-1 text-xs text-muted-foreground">
                        A clear prompt leaves no room for misinterpretation and
                        clearly communicates your intent.
                      </p>
                    </li>
                    <li>
                      <strong>Effectiveness:</strong> Does your prompt achieve
                      the desired outcome?
                      <p className="mt-1 text-xs text-muted-foreground">
                        An effective prompt consistently produces the results
                        you're looking for.
                      </p>
                    </li>
                    <li>
                      <strong>Efficiency:</strong> Is your prompt concise and to
                      the point?
                      <p className="mt-1 text-xs text-muted-foreground">
                        An efficient prompt uses the minimum number of words
                        needed to get the job done.
                      </p>
                    </li>
                    <li>
                      <strong>Robustness:</strong> Does your prompt handle edge
                      cases?
                      <p className="mt-1 text-xs text-muted-foreground">
                        A robust prompt works well across a variety of inputs
                        and scenarios.
                      </p>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-medium">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Example Prompt Structure
                  </h3>
                  <div className="rounded bg-muted p-3 font-mono text-sm">
                    <p>I need you to [specific task] for [specific purpose].</p>
                    <p className="mt-2">Please follow these guidelines:</p>
                    <p>1. [First constraint or requirement]</p>
                    <p>2. [Second constraint or requirement]</p>
                    <p>3. [Third constraint or requirement]</p>
                    <p className="mt-2">
                      Here's an example of what I'm looking for: [example]
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
