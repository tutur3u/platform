'use client';

import { PlanRequest, SkillLevel, TimeOfDay } from '../../types';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Brain,
  Clock,
  GraduationCap,
  Plus,
  Settings2,
  Sparkles,
  Target,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TagInput } from '@tuturuuu/ui/tag-input';
import { useState } from 'react';

type AdvancedSettings = Omit<PlanRequest, 'wsId' | 'goals'>;

interface GoalsInputProps {
  // eslint-disable-next-line no-unused-vars
  onSubmit: (goals: string[], settings: AdvancedSettings) => void;
  isLoading: boolean;
  error?: Error | null;
}

const LEARNING_STYLES = [
  {
    value: 'visual',
    label: 'Visual',
    description:
      'Learn best through images, diagrams, and spatial understanding',
  },
  {
    value: 'auditory',
    label: 'Auditory',
    description: 'Learn best through listening and speaking',
  },
  {
    value: 'reading',
    label: 'Reading',
    description: 'Learn best through reading and writing',
  },
  {
    value: 'kinesthetic',
    label: 'Hands-on',
    description:
      'Learn best through physical activities and practical exercises',
  },
] as const;

const SKILL_LEVELS: Array<{
  value: SkillLevel;
  label: string;
  description: string;
}> = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Little to no experience in this area',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Some experience, looking to advance skills',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Significant experience, aiming for mastery',
  },
];

const TIME_SLOTS: Array<{ value: TimeOfDay; label: string }> = [
  { value: 'morning', label: 'Morning (6 AM - 12 PM)' },
  { value: 'afternoon', label: 'Afternoon (12 PM - 6 PM)' },
  { value: 'evening', label: 'Evening (6 PM - 12 AM)' },
];

export function GoalsInput({
  onSubmit,
  isLoading,
  error: submitError,
}: GoalsInputProps) {
  const [goals, setGoals] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('goals');
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>({
    skillLevel: 'beginner',
    availability: 20,
    planDuration: 12,
    learningStyle: 'reading',
    preferredSchedule: {
      weekdays: true,
      weekends: false,
      timeOfDay: 'morning' as TimeOfDay,
    },
    focusAreas: [],
    existingSkills: [],
    dependencies: [],
    milestoneFrequency: 'monthly',
  });

  const handleAddGoal = () => {
    setGoals([...goals, '']);
  };

  const handleRemoveGoal = (index: number) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const handleGoalChange = (index: number, value: string) => {
    const newGoals = [...goals];
    newGoals[index] = value;
    setGoals(newGoals);
  };

  const validateSettings = () => {
    const validGoals = goals.filter((goal) => goal.trim() !== '');
    if (validGoals.length === 0) {
      setError('Please add at least one goal');
      return null;
    }

    if (!advancedSettings.skillLevel) {
      setError('Please select a skill level');
      return null;
    }

    if (!advancedSettings.availability || advancedSettings.availability < 1) {
      setError('Please select a valid weekly availability');
      return null;
    }

    // Ensure at least one schedule preference is selected
    if (
      !advancedSettings.preferredSchedule?.weekdays &&
      !advancedSettings.preferredSchedule?.weekends
    ) {
      setError(
        'Please select at least one schedule preference (weekdays or weekends)'
      );
      return null;
    }

    return {
      goals: validGoals,
      settings: advancedSettings,
    };
  };

  const handleSubmit = async () => {
    const validated = validateSettings();
    if (!validated) return null;

    setError(null);
    onSubmit(validated.goals, validated.settings);
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" />
          Plan Configuration
        </CardTitle>
        <CardDescription>
          Configure your learning goals and preferences to generate a
          personalized plan.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="goals" className="space-y-4">
            <div className="space-y-4">
              {goals.map((goal, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder={`Goal ${index + 1}`}
                    value={goal}
                    onChange={(e) => handleGoalChange(index, e.target.value)}
                    className="flex-1 font-medium"
                  />

                  {goals.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveGoal(index)}
                      className="hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleAddGoal}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Goal
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid gap-6">
              <div className="mb-6 space-y-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="text-primary h-5 w-5" />
                  <h3 className="font-medium">Learning Profile</h3>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Skill Level
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={advancedSettings.skillLevel}
                      onValueChange={(value: SkillLevel) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          skillLevel: value,
                        })
                      }
                    >
                      <SelectTrigger className="h-full">
                        <SelectValue placeholder="Select skill level" />
                      </SelectTrigger>
                      <SelectContent>
                        {SKILL_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            <div className="flex flex-col items-start justify-start gap-1">
                              <span>{level.label}</span>
                              <span className="text-muted-foreground text-xs">
                                {level.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Learning Style
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={advancedSettings.learningStyle}
                      onValueChange={(
                        value: (typeof LEARNING_STYLES)[number]['value']
                      ) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          learningStyle: value,
                        })
                      }
                    >
                      <SelectTrigger className="h-full">
                        <SelectValue placeholder="Select learning style" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEARNING_STYLES.map((style) => (
                          <SelectItem key={style.value} value={style.value}>
                            <div className="flex flex-col items-start justify-start gap-1">
                              <span>{style.label}</span>
                              <span className="text-muted-foreground text-xs">
                                {style.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="text-primary h-5 w-5" />
                  <h3 className="font-medium">Time Commitment</h3>
                </div>
                <Separator />
                <div className="grid items-start justify-start gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Weekly Availability (hours)
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={advancedSettings.availability.toString()}
                      onValueChange={(value) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          availability: parseInt(value),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select hours" />
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 10, 20, 30, 40].map((hours) => (
                          <SelectItem key={hours} value={hours.toString()}>
                            {hours} hours/week
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Milestone Frequency
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={advancedSettings.milestoneFrequency}
                      onValueChange={(
                        value: 'weekly' | 'monthly' | 'quarterly'
                      ) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          milestoneFrequency: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { value: 'weekly', label: 'Weekly Reviews' },
                          { value: 'monthly', label: 'Monthly Reviews' },
                          { value: 'quarterly', label: 'Quarterly Reviews' },
                        ].map((freq) => (
                          <SelectItem key={freq.value} value={freq.value}>
                            {freq.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="flex items-center gap-1">
                    Schedule Preferences
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="weekdays"
                        checked={
                          advancedSettings.preferredSchedule?.weekdays ?? true
                        }
                        onCheckedChange={(checked: boolean) =>
                          setAdvancedSettings({
                            ...advancedSettings,
                            preferredSchedule: {
                              weekdays: checked,
                              weekends:
                                advancedSettings.preferredSchedule?.weekends ??
                                false,
                              timeOfDay:
                                advancedSettings.preferredSchedule?.timeOfDay ??
                                'morning',
                            },
                          })
                        }
                      />
                      <label
                        htmlFor="weekdays"
                        className="text-sm font-medium leading-none"
                      >
                        Weekdays
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="weekends"
                        checked={
                          advancedSettings.preferredSchedule?.weekends ?? false
                        }
                        onCheckedChange={(checked: boolean) =>
                          setAdvancedSettings({
                            ...advancedSettings,
                            preferredSchedule: {
                              weekdays:
                                advancedSettings.preferredSchedule?.weekdays ??
                                true,
                              weekends: checked,
                              timeOfDay:
                                advancedSettings.preferredSchedule?.timeOfDay ??
                                'morning',
                            },
                          })
                        }
                      />
                      <label
                        htmlFor="weekends"
                        className="text-sm font-medium leading-none"
                      >
                        Weekends
                      </label>
                    </div>
                  </div>

                  <Select
                    value={
                      advancedSettings.preferredSchedule?.timeOfDay ?? 'morning'
                    }
                    onValueChange={(value: TimeOfDay) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        preferredSchedule: {
                          weekdays:
                            advancedSettings.preferredSchedule?.weekdays ??
                            true,
                          weekends:
                            advancedSettings.preferredSchedule?.weekends ??
                            false,
                          timeOfDay: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Preferred time of day" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((slot) => (
                        <SelectItem key={slot.value} value={slot.value}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="text-primary h-5 w-5" />
                  <h3 className="font-medium">Skills & Focus Areas</h3>
                </div>
                <Separator />
                <div className="grid gap-4">
                  <div className="grid space-y-2">
                    <Label className="flex items-center gap-1">
                      Focus Areas
                    </Label>
                    <TagInput
                      placeholder="Add focus areas"
                      tags={advancedSettings.focusAreas ?? []}
                      setTags={(tags) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          focusAreas: tags,
                        })
                      }
                      maxTags={5}
                    />
                    <p className="text-muted-foreground text-xs">
                      Add up to 5 specific areas you want to focus on
                    </p>
                  </div>

                  <div className="grid space-y-2">
                    <Label className="flex items-center gap-1">
                      Existing Skills
                    </Label>
                    <TagInput
                      placeholder="Add existing skills"
                      tags={advancedSettings.existingSkills ?? []}
                      setTags={(tags) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          existingSkills: tags,
                        })
                      }
                      maxTags={10}
                    />
                    <p className="text-muted-foreground text-xs">
                      List skills you already have that are relevant to your
                      goals
                    </p>
                  </div>

                  <div className="grid space-y-2">
                    <Label className="flex items-center gap-1">
                      Dependencies
                    </Label>
                    <TagInput
                      placeholder="Add dependencies"
                      tags={advancedSettings.dependencies ?? []}
                      setTags={(tags) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          dependencies: tags,
                        })
                      }
                      maxTags={5}
                    />
                    <p className="text-muted-foreground text-xs">
                      Add any prerequisites or dependencies for your goals
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {(error || submitError) && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error || submitError?.message}</AlertDescription>
          </Alert>
        )}

        <Button
          type="button"
          className="from-primary to-primary/90 hover:from-primary/90 hover:to-primary bg-linear-to-r mt-6 w-full"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="ml-2">Generating Plan...</span>
            </>
          ) : (
            'Generate Plan'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
