'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tutur3u/ui/select';
import { Settings2 } from 'lucide-react';

interface PlanSettingsProps {
  planDuration: number;
  onPlanDurationChange: (value: number) => void;
}

export function PlanSettings({
  planDuration,
  onPlanDurationChange,
}: PlanSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Plan Settings
        </CardTitle>
        <CardDescription>
          Customize your plan to match your preferences and availability
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="duration"
              className="text-sm font-medium text-muted-foreground"
            >
              Plan Duration
            </label>
            <Select
              value={planDuration.toString()}
              onValueChange={(value) => onPlanDurationChange(Number(value))}
            >
              <SelectTrigger id="duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
