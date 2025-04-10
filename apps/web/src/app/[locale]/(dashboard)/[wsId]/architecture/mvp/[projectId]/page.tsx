import ProjectAnalysis from './analysis';
import CommentsTab from './comments-tab';
import { ExportButton } from './export-button';
import ImpactChart from './impact-chart';
import { ShareButton } from './share-button';
import { PartialBorderBox } from '@/components/shared/partialBorderBox';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  BarChart2,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock,
  FileCheck,
} from 'lucide-react';
import Link from 'next/link';

// Sample data for the impact metrics visualization
const SAMPLE_IMPACT_METRICS = [
  { name: 'Revenue Increase', value: 30, color: 'var(--color-chart-1)' },
  { name: 'Cost Reduction', value: 45, color: 'var(--color-chart-2)' },
  { name: 'Time Saved', value: 60, color: 'var(--color-chart-3)' },
  { name: 'User Satisfaction', value: 85, color: 'var(--color-chart-4)' },
  { name: 'Productivity', value: 70, color: 'var(--color-chart-5)' },
];

const SAMPLE_BUSINESS_METRICS = [
  { name: 'ROI', value: 120, color: 'var(--color-dynamic-blue)' },
  { name: 'Payback Period', value: 18, color: 'var(--color-dynamic-orange)' },
  {
    name: 'Net Present Value',
    value: 250000,
    color: 'var(--color-dynamic-green)',
  },
  { name: 'IRR', value: 25, color: 'var(--color-dynamic-purple)' },
];

interface Params {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export default async function ArchitectureProjectPage({ params }: Params) {
  const { wsId, projectId } = await params;
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from('workspace_architecture_projects')
    .select('*')
    .eq('id', projectId)
    .eq('ws_id', wsId)
    .single();

  if (error || !project) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Link href={`/${wsId}/architecture/mvp`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Project not found
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The requested project could not be found.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const projectUrl = `${baseUrl}/${wsId}/architecture/mvp/${projectId}`;

  // Format business metrics for display
  const formattedBusinessMetrics = SAMPLE_BUSINESS_METRICS.map((metric) => {
    let formattedValue = metric.value;
    if (metric.name === 'ROI') {
      formattedValue = `${metric.value}%`;
    } else if (metric.name === 'Payback Period') {
      formattedValue = `${metric.value} months`;
    } else if (metric.name === 'Net Present Value') {
      formattedValue = `$${metric.value.toLocaleString()}`;
    } else if (metric.name === 'IRR') {
      formattedValue = `${metric.value}%`;
    }
    return { ...metric, formattedValue };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/${wsId}/architecture/mvp`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <ShareButton projectUrl={projectUrl} projectName={project.name} />
          {project.status === 'completed' && (
            <ExportButton wsId={wsId} projectId={projectId} project={project} />
          )}
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground">{project.location}</p>
        </div>

        <div className="flex items-center space-x-2">
          <p className="text-sm text-muted-foreground">
            Created{' '}
            {formatDistanceToNow(new Date(project.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.location}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {project.status || 'Pending'}
              </div>
              {project.status === 'in-progress' && (
                <Badge variant="secondary" className="animate-pulse">
                  Generating...
                </Badge>
              )}
              {project.status === 'completed' && (
                <Badge variant="default">Completed</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {format(new Date(project.created_at), 'PP')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.updated_at
                ? format(new Date(project.updated_at), 'PP')
                : format(new Date(project.created_at), 'PP')}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analysis" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="impact" className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Impact Metrics
          </TabsTrigger>
          <TabsTrigger value="business" className="flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4" />
            Business Case
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-4">
          <ProjectAnalysis
            wsId={wsId}
            project={{
              ...project,
              updated_at: project.updated_at || undefined,
              status: project.status || undefined,
            }}
          />
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Building Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="rounded-md bg-muted p-4">
                  <pre className="text-sm font-medium whitespace-pre-wrap">
                    {project.building_requirements}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="space-y-4">
          <CommentsTab wsId={wsId} projectId={projectId} />
        </TabsContent>

        <TabsContent value="impact">
          <ImpactChart
            title="Key Impact Metrics"
            description="Projected impact across key business dimensions"
            metrics={SAMPLE_IMPACT_METRICS}
            height={400}
          />
        </TabsContent>

        <TabsContent value="business">
          <PartialBorderBox className="mt-4 grid grid-cols-1 gap-4 rounded-md lg:grid-cols-2">
            {formattedBusinessMetrics.map((metric) => (
              <Card key={metric.name} className="bg-transparent">
                <CardHeader>
                  <CardTitle className="text-base">{metric.name}</CardTitle>
                  <CardDescription>Business case metric</CardDescription>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: metric.color }}
                  >
                    {metric.formattedValue}
                  </p>
                </CardContent>
              </Card>
            ))}
          </PartialBorderBox>
        </TabsContent>
      </Tabs>
    </div>
  );
}
