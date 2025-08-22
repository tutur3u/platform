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

export default function TimeTrackerReportsPage() {
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="report-type" className="text-sm font-medium">
                Report Type
              </label>
              <Select defaultValue="summary">
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
              <Select defaultValue="month">
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
              <Select defaultValue="all">
                <SelectTrigger id="team-member">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="john">John Doe</SelectItem>
                  <SelectItem value="jamb">Jane Smith</SelectItem>
                  <SelectItem value="mike">Mike Johnson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="format" className="text-sm font-medium">
                Format
              </label>
              <Select defaultValue="pdf">
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                <span className="font-semibold">127.5h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Productivity Score</span>
                <span className="font-semibold text-green-600">87%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Tasks Completed</span>
                <span className="font-semibold">24</span>
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
                <span className="font-semibold">Jane Smith</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Avg. Hours/Day</span>
                <span className="font-semibold">7.2h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Team Efficiency</span>
                <span className="font-semibold text-blue-600">82%</span>
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
                <span className="font-semibold">45%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Design</span>
                <span className="font-semibold">25%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Research</span>
                <span className="font-semibold">20%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meetings</span>
                <span className="font-semibold">10%</span>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <h3 className="font-medium">Monthly Productivity Report</h3>
                  <p className="text-sm text-muted-foreground">
                    Generated on August 15, 2024
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">PDF</Badge>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <FileText className="h-8 w-8 text-green-500" />
                <div>
                  <h3 className="font-medium">Project Time Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    Generated on August 10, 2024
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Excel</Badge>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <FileText className="h-8 w-8 text-orange-500" />
                <div>
                  <h3 className="font-medium">Team Performance Report</h3>
                  <p className="text-sm text-muted-foreground">
                    Generated on August 5, 2024
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">PDF</Badge>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            </div>
          </div>
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
            <div className="flex items-center justify-between rounded-lg border p-4">
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

            <div className="flex items-center justify-between rounded-lg border p-4">
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
