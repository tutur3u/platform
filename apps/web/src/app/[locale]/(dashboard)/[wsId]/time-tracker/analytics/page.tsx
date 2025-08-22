import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { ChartArea, Clock, TrendingUp, Users } from '@tuturuuu/ui/icons';

export default function TimeTrackerAnalyticsPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <ChartArea className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Analytics</h1>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Time Tracked
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">127.5h</div>
            <p className="text-xs text-muted-foreground">
              +12.3% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Projects
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">+2 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              All active this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Productivity Score
            </CardTitle>
            <ChartArea className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">87%</div>
            <p className="text-xs text-muted-foreground">+5% from last week</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Time Distribution by Project</CardTitle>
            <CardDescription>
              How time is allocated across different projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Chart placeholder - Time distribution visualization
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Time Trends</CardTitle>
            <CardDescription>
              Time tracking patterns over the last 4 weeks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Chart placeholder - Weekly trends visualization
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Analytics Sections */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Insights</CardTitle>
          <CardDescription>Key metrics and recommendations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-lg font-semibold text-green-600">
                Peak Hours
              </div>
              <div className="text-2xl font-bold">9 AM - 11 AM</div>
              <div className="text-sm text-muted-foreground">
                Most productive time
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-lg font-semibold text-blue-600">
                Focus Score
              </div>
              <div className="text-2xl font-bold">92%</div>
              <div className="text-sm text-muted-foreground">
                High concentration
              </div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-lg font-semibold text-orange-600">
                Break Efficiency
              </div>
              <div className="text-2xl font-bold">78%</div>
              <div className="text-sm text-muted-foreground">Good balance</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
