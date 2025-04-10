'use client';

import { CostChart } from './cost-chart';
import { TimelineChart } from './timeline-chart';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Briefcase, Calendar, Clock, FileWarning } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ArchitectureProject {
  id: string;
  name: string;
  location: string;
  building_requirements: string;
  analysis?: any;
  ws_id: string;
  created_at: string;
  updated_at?: string;
  status?: string;
}

interface ProjectAnalysisProps {
  wsId: string;
  project: ArchitectureProject;
}

export default function ProjectAnalysis({
  wsId,
  project,
}: ProjectAnalysisProps) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<any>(project.analysis);
  const [isLoading, setIsLoading] = useState<boolean>(
    !project.analysis || project.status === 'in-progress'
  );
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Start generating analysis automatically if status is in-progress
  useEffect(() => {
    if (project.status === 'in-progress' && !project.analysis) {
      generateAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.status, project.analysis]);

  const generateAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 5;
      });
    }, 1000);

    try {
      console.log('[ARCHITECTURE] Starting analysis generation process');

      // Update the project status to in-progress if it's not already
      if (project.status !== 'in-progress') {
        await fetch(`/api/v1/workspaces/${wsId}/architecture/${project.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'in-progress',
          }),
        });
      }

      console.log('[ARCHITECTURE] Payload:', {
        wsId,
        location: project.location,
        buildingRequirements: project.building_requirements,
      });

      // Send directly to the object/architecture endpoint
      console.log('[ARCHITECTURE] Sending request to /api/object/architecture');
      const response = await fetch('/api/object/architecture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wsId,
          location: project.location,
          buildingRequirements: project.building_requirements,
        }),
      });

      console.log('[ARCHITECTURE] Response status:', response.status);
      console.log('[ARCHITECTURE] Response ok:', response.ok);

      if (!response.ok) {
        let errorMessage = 'Failed to generate analysis';
        try {
          const errorData = await response.json();
          console.error('[ARCHITECTURE] Error response:', errorData);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          console.error('[ARCHITECTURE] Failed to parse error response');
          const errorText = await response.text();
          console.error('[ARCHITECTURE] Error text:', errorText);
        }
        throw new Error(errorMessage);
      }

      console.log('[ARCHITECTURE] Response received, starting to read stream');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result = '';

      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      let chunkCounter = 0;
      console.log('[ARCHITECTURE] Reading response chunks...');

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[ARCHITECTURE] Reached end of stream');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        chunkCounter++;
        console.log(
          `[ARCHITECTURE] Received chunk ${chunkCounter}, length: ${chunk.length}`
        );
        result += chunk;

        try {
          const parsedData = JSON.parse(result);
          console.log(
            '[ARCHITECTURE] Successfully parsed JSON data',
            parsedData
          );
          setAnalysis(parsedData);
        } catch (e) {
          console.log(
            '[ARCHITECTURE] Chunk is not complete JSON yet, continuing...'
          );
        }
      }

      clearInterval(progressInterval);
      setProgress(100);

      console.log('[ARCHITECTURE] Final result:', result);
      console.log('[ARCHITECTURE] Current analysis state:', analysis);

      // Try parsing the result one more time to make sure we have the latest
      try {
        const finalParsedData = JSON.parse(result);
        setAnalysis(finalParsedData);
      } catch (e) {
        console.error('[ARCHITECTURE] Failed to parse final result', e);
      }

      // Update the project with the analysis
      console.log('[ARCHITECTURE] Updating project with analysis results');
      const updateResponse = await fetch(
        `/api/v1/workspaces/${wsId}/architecture/${project.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            analysis: analysis,
            status: 'completed',
          }),
        }
      );

      console.log(
        '[ARCHITECTURE] Update response status:',
        updateResponse.status
      );

      if (!updateResponse.ok) {
        console.error('[ARCHITECTURE] Failed to save analysis results');
        const errorText = await updateResponse.text();
        console.error('[ARCHITECTURE] Error text:', errorText);
        throw new Error('Failed to save analysis results');
      }

      console.log('[ARCHITECTURE] Analysis completed and saved successfully');
      toast({
        title: 'Analysis generated',
        description: 'The building regulations analysis has been completed.',
      });

      router.refresh();
    } catch (error) {
      console.error('[ARCHITECTURE] Error during analysis:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred'
      );

      // Reset the project status to pending
      try {
        await fetch(`/api/v1/workspaces/${wsId}/architecture/${project.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'pending',
          }),
        });
      } catch (statusError) {
        console.error(
          '[ARCHITECTURE] Failed to reset project status:',
          statusError
        );
      }

      toast({
        title: 'Failed to generate analysis',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
      setProgress(100);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            Generating Building Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Progress value={progress} className="h-2 w-full" />
            <p className="text-center text-sm text-muted-foreground">
              {progress < 100
                ? 'Analyzing building regulations...'
                : 'Analysis complete!'}
            </p>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-[20px] w-full" />
            <Skeleton className="h-[20px] w-full" />
            <Skeleton className="h-[20px] w-[250px]" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-[20px] w-full" />
              <Skeleton className="h-[20px] w-full" />
              <Skeleton className="h-[20px] w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-[20px] w-full" />
              <Skeleton className="h-[20px] w-full" />
              <Skeleton className="h-[20px] w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            Error Generating Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-destructive/10 p-4">
            <div className="flex items-center">
              <FileWarning className="mr-2 h-5 w-5 text-destructive" />
              <p className="font-medium text-destructive">{error}</p>
            </div>
          </div>
          <Button onClick={generateAnalysis}>Try Again</Button>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            Building Regulations Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Generate a comprehensive analysis of building regulations, permit
            requirements, construction timeline, and cost estimations for your
            project.
          </p>
          <Button onClick={generateAnalysis}>Generate Analysis</Button>
        </CardContent>
      </Card>
    );
  }

  // Display the analysis results
  const { buildingAnalysis } = analysis;

  return (
    <div id="architecture-analysis" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            Regulation Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">
            {buildingAnalysis.regulationSummary}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            Permit Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {buildingAnalysis.permitRequirements.map(
              (permit: any, index: number) => (
                <AccordionItem key={index} value={`permit-${index}`}>
                  <AccordionTrigger>{permit.name}</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 p-2">
                      <p>{permit.description}</p>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Timeline:</span>
                          <span className="text-sm">{permit.timeline}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Estimated Cost:
                          </span>
                          <span className="text-sm">
                            {permit.estimatedCost}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="text-sm font-medium">
                          Required Documents:
                        </span>
                        <ul className="list-disc pt-1 pl-5 text-sm">
                          {permit.requiredDocuments.map(
                            (doc: string, docIndex: number) => (
                              <li key={docIndex}>{doc}</li>
                            )
                          )}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            )}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Project Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <TimelineChart timeline={buildingAnalysis.timeline} />

            <div className="space-y-4">
              {buildingAnalysis.timeline.map((phase: any, index: number) => (
                <div
                  key={index}
                  className="relative overflow-hidden rounded-md border p-4"
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: `hsl(${(index * 30) % 360}, 70%, 50%)`,
                  }}
                >
                  <div className="mb-2 flex flex-col md:flex-row md:justify-between">
                    <div>
                      <h3 className="font-bold">{phase.phase}</h3>
                      <p className="text-sm text-muted-foreground">
                        {phase.description}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 pt-2 text-sm text-muted-foreground md:pt-0">
                      <Calendar className="h-4 w-4" />
                      <span>{phase.startDate}</span>
                      <span>•</span>
                      <Clock className="h-4 w-4" />
                      <span>{phase.duration}</span>
                    </div>
                  </div>

                  {phase.dependencies && phase.dependencies.length > 0 && (
                    <div className="pt-2">
                      <span className="text-sm font-medium">Dependencies:</span>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {phase.dependencies.map(
                          (dep: string, depIndex: number) => (
                            <Badge key={depIndex} variant="outline">
                              {dep}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {phase.keyMilestones && phase.keyMilestones.length > 0 && (
                    <div className="pt-2">
                      <span className="text-sm font-medium">
                        Key Milestones:
                      </span>
                      <ul className="list-disc pt-1 pl-5 text-sm">
                        {phase.keyMilestones.map(
                          (milestone: any, milestoneIndex: number) => (
                            <li key={milestoneIndex}>
                              <span className="font-medium">
                                {milestone.name}
                              </span>
                              : {milestone.description}
                              <span className="text-muted-foreground">
                                {' '}
                                (Est. {milestone.estimatedDate})
                              </span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Cost Estimation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Total Estimated Cost:</h3>
              <p className="text-xl font-bold">
                {buildingAnalysis.costEstimation.totalEstimate}
              </p>
            </div>

            <CostChart
              costBreakdown={buildingAnalysis.costEstimation.breakdown}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildingAnalysis.costEstimation.breakdown.map(
                  (item: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {item.category}
                      </TableCell>
                      <TableCell>{item.estimate}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.notes}
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>

            <div>
              <h3 className="mb-2 font-medium">Cost Factors:</h3>
              <ul className="list-disc space-y-1 pl-5">
                {buildingAnalysis.costEstimation.costFactors.map(
                  (factor: string, factorIndex: number) => (
                    <li key={factorIndex}>{factor}</li>
                  )
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold">
              Environmental Considerations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {buildingAnalysis.environmentalConsiderations.map(
                (consideration: any, index: number) => (
                  <AccordionItem key={index} value={`env-${index}`}>
                    <AccordionTrigger>{consideration.aspect}</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 p-2">
                        <p>{consideration.description}</p>

                        <div className="pt-2">
                          <span className="text-sm font-medium">
                            Regulatory Requirements:
                          </span>
                          <p className="pt-1 text-sm">
                            {consideration.regulatoryRequirements}
                          </p>
                        </div>

                        <div className="pt-2">
                          <span className="text-sm font-medium">
                            Recommended Actions:
                          </span>
                          <ul className="list-disc pt-1 pl-5 text-sm">
                            {consideration.recommendedActions.map(
                              (action: string, actionIndex: number) => (
                                <li key={actionIndex}>{action}</li>
                              )
                            )}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              )}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold">Risk Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {buildingAnalysis.riskAssessment.map(
                (risk: any, index: number) => {
                  const impactColors = {
                    low: 'bg-green-100 text-green-800',
                    medium: 'bg-yellow-100 text-yellow-800',
                    high: 'bg-red-100 text-red-800',
                  };

                  return (
                    <div key={index} className="rounded-md border p-4">
                      <div className="mb-2 flex flex-col sm:flex-row sm:justify-between">
                        <h3 className="font-bold">{risk.risk}</h3>
                        <div className="mt-1 flex items-center space-x-2 sm:mt-0">
                          <Badge
                            variant="outline"
                            className={`${impactColors[risk.likelihood as keyof typeof impactColors]} border-none`}
                          >
                            Likelihood: {risk.likelihood}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`${impactColors[risk.impact as keyof typeof impactColors]} border-none`}
                          >
                            Impact: {risk.impact}
                          </Badge>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="text-sm font-medium">
                          Mitigation Strategies:
                        </span>
                        <ul className="list-disc pt-1 pl-5 text-sm">
                          {risk.mitigationStrategies.map(
                            (strategy: string, strategyIndex: number) => (
                              <li key={strategyIndex}>{strategy}</li>
                            )
                          )}
                        </ul>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {buildingAnalysis.recommendations.map(
              (recommendation: string, index: number) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {index + 1}
                  </div>
                  <p>{recommendation}</p>
                </li>
              )
            )}
          </ul>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={generateAnalysis}
          >
            Regenerate Analysis
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
