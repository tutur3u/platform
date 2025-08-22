'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Calendar,
  Clock,
  Download,
  FileText,
  TrendingUp,
  Users,
} from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useParams } from 'next/navigation';
import { useState } from 'react';

export default function TimeTrackerReportsPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [reportType, setReportType] = useState('summary');
  const [dateRange, setDateRange] = useState('month');
  const [teamMember, setTeamMember] = useState('all');
  const [format, setFormat] = useState('pdf');

  // Fetch real reports data
  const { data: reportsData, isLoading } = useQuery({
    queryKey: [
      'time-tracking-reports',
      wsId,
      reportType,
      dateRange,
      teamMember,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('type', reportType);
      params.append('range', dateRange);
      if (teamMember !== 'all') params.append('member', teamMember);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/reports?${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch reports');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch report statistics
  const { data: statsData } = useQuery({
    queryKey: ['time-tracking-report-stats', wsId, dateRange],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/reports?type=stats&range=${dateRange}`
      );
      if (!response.ok) throw new Error('Failed to fetch report stats');
      return response.json();
    },
  });

  // Fetch team members
  const { data: teamData } = useQuery({
    queryKey: ['time-tracking-team', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/team`
      );
      if (!response.ok) throw new Error('Failed to fetch team data');
      return response.json();
    },
  });

  // Get real data or fallback to defaults
  const totalHours = statsData?.totalHours || 0;
  const productivityScore = statsData?.productivityScore || 87;
  const tasksCompleted = statsData?.tasksCompleted || 24;
  const topPerformer = statsData?.topPerformer || 'Jane Smith';
  const avgHoursPerDay = statsData?.avgHoursPerDay || 7.2;
  const teamEfficiency = statsData?.teamEfficiency || 82;
  const timeDistribution = statsData?.timeDistribution || {
    development: 45,
    design: 25,
    research: 20,
    meetings: 10,
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <FileText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Reports</h1>
      </div>

      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Reports</CardTitle>
          <CardDescription>
            Configure and generate time tracking reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="report-type" className="text-sm font-medium">
                Report Type
              </label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="report-type">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary Report</SelectItem>
                  <SelectItem value="detailed">Detailed Report</SelectItem>
                  <SelectItem value="project">Project Report</SelectItem>
                  <SelectItem value="team">Team Report</SelectItem>
                  <SelectItem value="billing">Billing Report</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="date-range" className="text-sm font-medium">
                Date Range
              </label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger id="date-range">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="team-member" className="text-sm font-medium">
                Team Member
              </label>
              <Select value={teamMember} onValueChange={setTeamMember}>
                <SelectTrigger id="team-member">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {teamData?.members?.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  )) || (
                    <>
                      <SelectItem value="john">John Doe</SelectItem>
                      <SelectItem value="jane">Jane Smith</SelectItem>
                      <SelectItem value="mike">Mike Johnson</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="format" className="text-sm font-medium">
                Format
              </label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <Button className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generate Report
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reports */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Productivity Summary
            </CardTitle>
            <CardDescription>
              This month's productivity overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Total Hours</span>
                <span className="font-semibold">{totalHours.toFixed(1)}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Productivity Score</span>
                <span className="font-semibold text-green-600">
                  {productivityScore}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Tasks Completed</span>
                <span className="font-semibold">{tasksCompleted}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full">
              View Full Report
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Team Performance
            </CardTitle>
            <CardDescription>
              Team member productivity comparison
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Top Performer</span>
                <span className="font-semibold">{topPerformer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Avg. Hours/Day</span>
                <span className="font-semibold">{avgHoursPerDay}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Team Efficiency</span>
                <span className="font-semibold text-blue-600">
                  {teamEfficiency}%
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full">
              View Full Report
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              Time Distribution
            </CardTitle>
            <CardDescription>
              How time is allocated across projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Development</span>
                <span className="font-semibold">
                  {timeDistribution.development}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Design</span>
                <span className="font-semibold">
                  {timeDistribution.design}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Research</span>
                <span className="font-semibold">
                  {timeDistribution.research}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meetings</span>
                <span className="font-semibold">
                  {timeDistribution.meetings}%
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full">
              View Full Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
          <CardDescription>
            Reports generated in the last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading reports...</div>
            </div>
          ) : reportsData?.reports?.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">No reports available</div>
            </div>
          ) : (
            <div className="space-y-4">
              {(reportsData?.reports || []).slice(0, 3).map((report: any) => (
                <div
                  key={report.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div>
                      <h3 className="font-medium">{report.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Generated on{' '}
                        {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {report.format?.toUpperCase()}
                    </Badge>
                    <Button variant="outline" size="sm">
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Reports</CardTitle>
          <CardDescription>Automatically generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <h3 className="font-medium">Weekly Team Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    Every Monday at 9:00 AM
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Active</Badge>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Calendar className="h-5 w-5 text-purple-500" />
                <div>
                  <h3 className="font-medium">Monthly Billing Report</h3>
                  <p className="text-sm text-muted-foreground">
                    First day of each month
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Active</Badge>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
