'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Settings2 } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';

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
              className="font-medium text-muted-foreground text-sm"
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
