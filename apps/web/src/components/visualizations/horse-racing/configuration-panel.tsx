import { HelpCircle, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Slider } from '@tuturuuu/ui/slider';
import { Switch } from '@tuturuuu/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';

interface ConfigurationPanelProps {
  numHorses: number;
  setNumHorses: (value: number) => void;
  raceSize: number;
  setRaceSize: (value: number) => void;
  animationSpeed: number;
  setAnimationSpeed: (value: number) => void;
  speedDistribution: 'uniform' | 'normal' | 'exponential' | 'clustered';
  setSpeedDistribution: (
    value: 'uniform' | 'normal' | 'exponential' | 'clustered'
  ) => void;
  showAnimation: boolean;
  setShowAnimation: (value: boolean) => void;
  showHorseSpeeds: boolean;
  setShowHorseSpeeds: (value: boolean) => void;
  regenerateHorses: () => void;
  isRunning: boolean;
}

export function ConfigurationPanel({
  numHorses,
  setNumHorses,
  raceSize,
  setRaceSize,
  animationSpeed,
  setAnimationSpeed,
  speedDistribution,
  setSpeedDistribution,
  showAnimation,
  setShowAnimation,
  showHorseSpeeds,
  setShowHorseSpeeds,
  regenerateHorses,
  isRunning,
}: ConfigurationPanelProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label
                htmlFor="num-horses"
                className="flex items-center justify-between"
              >
                Number of Horses (N)
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle size={14} className="text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total number of horses to rank</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="num-horses-slider"
                  min={2}
                  max={100}
                  step={1}
                  value={[numHorses]}
                  onValueChange={(value) => setNumHorses(value[0] ?? 10)}
                  className="flex-1"
                />
                <Input
                  id="num-horses"
                  type="number"
                  min="2"
                  max="100"
                  value={numHorses}
                  onChange={(e) =>
                    setNumHorses(parseInt(e.target.value, 10) || 10)
                  }
                  className="w-20"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Set between 2-100 horses
              </p>
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor="race-size"
                className="flex items-center justify-between"
              >
                Race Size (M)
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle size={14} className="text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Number of horses that can race at once</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center gap-2">
                <Slider
                  id="race-size-slider"
                  min={2}
                  max={Math.min(10, numHorses)}
                  step={1}
                  value={[raceSize]}
                  onValueChange={(value) => setRaceSize(value[0] ?? 2)}
                  className="flex-1"
                />
                <Input
                  id="race-size"
                  type="number"
                  min="2"
                  max={numHorses}
                  value={raceSize}
                  onChange={(e) =>
                    setRaceSize(parseInt(e.target.value, 10) || 2)
                  }
                  className="w-20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label
                htmlFor="speed-distribution"
                className="flex items-center justify-between"
              >
                Speed Distribution
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle size={14} className="text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Uniform: Even distribution of speeds</p>
                      <p>Normal: Bell curve distribution</p>
                      <p>Exponential: Many slow, few fast horses</p>
                      <p>Clustered: Three distinct groups</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Select
                value={speedDistribution}
                onValueChange={(value) =>
                  setSpeedDistribution(
                    value as 'uniform' | 'normal' | 'exponential' | 'clustered'
                  )
                }
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select distribution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uniform">Uniform</SelectItem>
                  <SelectItem value="normal">Normal (Bell Curve)</SelectItem>
                  <SelectItem value="exponential">Exponential</SelectItem>
                  <SelectItem value="clustered">Clustered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="animation-speed">Animation Speed</Label>
              <Slider
                id="animation-speed"
                min={200}
                max={3000}
                step={100}
                value={[animationSpeed]}
                onValueChange={(value) => setAnimationSpeed(value[0] ?? 1000)}
              />
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Fast</span>
                <span className="text-muted-foreground text-xs">Slow</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-animation" className="cursor-pointer">
                  Show race animations
                </Label>
                <Switch
                  id="show-animation"
                  checked={showAnimation}
                  onCheckedChange={setShowAnimation}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-speeds" className="cursor-pointer">
                  Show horse speeds
                </Label>
                <Switch
                  id="show-speeds"
                  checked={showHorseSpeeds}
                  onCheckedChange={setShowHorseSpeeds}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={regenerateHorses}
            disabled={isRunning}
            variant="outline"
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            Regenerate Horses
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
