'use client';

import { CostChart } from '../[projectId]/cost-chart';
import { TimelineChart } from '../[projectId]/timeline-chart';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Form, FormControl, FormField, FormItem } from '@tuturuuu/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

interface ArchitectureProject {
  id: string;
  name: string;
  location: string;
  building_requirements: string;
  created_at: string;
  analysis?: any;
  status?: 'pending' | 'completed' | 'in-progress';
}

const FormSchema = z.object({
  project1: z.string().min(1, 'Please select a project'),
  project2: z.string().min(1, 'Please select a project'),
});

export default function ComparePage() {
  const { wsId } = useParams();
  const [projects, setProjects] = useState<ArchitectureProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [project1Data, setProject1Data] = useState<ArchitectureProject | null>(
    null
  );
  const [project2Data, setProject2Data] = useState<ArchitectureProject | null>(
    null
  );

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      project1: '',
      project2: '',
    },
  });

  // Load all completed projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch(`/api/v1/workspaces/${wsId}/architecture`);
        if (response.ok) {
          const data = await response.json();
          const completedProjects = data.filter(
            (project: ArchitectureProject) =>
              project.status === 'completed' && project.analysis
          );
          setProjects(completedProjects);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [wsId]);

  // Watch for form value changes and load project data
  const watchProject1 = form.watch('project1');
  const watchProject2 = form.watch('project2');

  useEffect(() => {
    if (watchProject1) {
      const fetchProject = async () => {
        try {
          const response = await fetch(
            `/api/v1/workspaces/${wsId}/architecture/${watchProject1}`
          );
          if (response.ok) {
            const data = await response.json();
            setProject1Data(data);
          }
        } catch (error) {
          console.error('Error fetching project 1:', error);
        }
      };

      fetchProject();
    }
  }, [watchProject1, wsId]);

  useEffect(() => {
    if (watchProject2) {
      const fetchProject = async () => {
        try {
          const response = await fetch(
            `/api/v1/workspaces/${wsId}/architecture/${watchProject2}`
          );
          if (response.ok) {
            const data = await response.json();
            setProject2Data(data);
          }
        } catch (error) {
          console.error('Error fetching project 2:', error);
        }
      };

      fetchProject();
    }
  }, [watchProject2, wsId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/${wsId}/architecture/mvp`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compare Projects</h1>
        <p className="text-muted-foreground">
          Compare two architecture projects to analyze differences in costs,
          timelines, and requirements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Projects to Compare</CardTitle>
          <CardDescription>
            Choose two completed projects to compare their analyses side by
            side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="project1"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select
                        disabled={isLoading}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select first project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name} ({project.location})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project2"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select
                        disabled={isLoading}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select second project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects
                            .filter((p) => p.id !== watchProject1)
                            .map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name} ({project.location})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </Form>
        </CardContent>
      </Card>

      {project1Data && project2Data && (
        <>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-lg font-medium">
                        {project1Data.name}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-medium">Location</h3>
                        <p>{project1Data.location}</p>
                      </div>
                      <div>
                        <h3 className="font-medium">Total Cost</h3>
                        <p>
                          {project1Data.analysis?.buildingAnalysis
                            ?.costEstimation?.totalEstimate || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium">Timeline</h3>
                        <p>
                          {project1Data.analysis?.buildingAnalysis?.timeline
                            ?.length || 0}{' '}
                          phases
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-lg font-medium">
                        {project2Data.name}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-medium">Location</h3>
                        <p>{project2Data.location}</p>
                      </div>
                      <div>
                        <h3 className="font-medium">Total Cost</h3>
                        <p>
                          {project2Data.analysis?.buildingAnalysis
                            ?.costEstimation?.totalEstimate || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium">Timeline</h3>
                        <p>
                          {project2Data.analysis?.buildingAnalysis?.timeline
                            ?.length || 0}{' '}
                          phases
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="costs" className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{project1Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project1Data.analysis?.buildingAnalysis
                      ?.costEstimation && (
                      <>
                        <div className="mb-4 text-center font-bold">
                          {
                            project1Data.analysis.buildingAnalysis
                              .costEstimation.totalEstimate
                          }
                        </div>
                        <CostChart
                          costBreakdown={
                            project1Data.analysis.buildingAnalysis
                              .costEstimation.breakdown
                          }
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{project2Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project2Data.analysis?.buildingAnalysis
                      ?.costEstimation && (
                      <>
                        <div className="mb-4 text-center font-bold">
                          {
                            project2Data.analysis.buildingAnalysis
                              .costEstimation.totalEstimate
                          }
                        </div>
                        <CostChart
                          costBreakdown={
                            project2Data.analysis.buildingAnalysis
                              .costEstimation.breakdown
                          }
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{project1Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project1Data.analysis?.buildingAnalysis?.timeline && (
                      <TimelineChart
                        timeline={
                          project1Data.analysis.buildingAnalysis.timeline
                        }
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{project2Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project2Data.analysis?.buildingAnalysis?.timeline && (
                      <TimelineChart
                        timeline={
                          project2Data.analysis.buildingAnalysis.timeline
                        }
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="requirements" className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{project1Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md bg-muted p-4">
                      <pre className="text-sm font-medium whitespace-pre-wrap">
                        {project1Data.building_requirements}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{project2Data.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md bg-muted p-4">
                      <pre className="text-sm font-medium whitespace-pre-wrap">
                        {project2Data.building_requirements}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
