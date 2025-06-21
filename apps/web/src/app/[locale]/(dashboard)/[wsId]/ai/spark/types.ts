export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'blocked';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Task {
  title: string;
  description: string;
  priority: Priority;
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  status: TaskStatus;
  estimatedHours: number;
  dependencies?: string[];
  resources?: {
    title: string;
    url: string;
    type: 'video' | 'article' | 'book' | 'course' | 'other';
  }[];
  milestone?: string; // Reference to parent milestone
  quarter?: number; // Reference to parent quarter
}

export interface Milestone {
  title: string;
  description: string;
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  tasks: Task[];
  progress: number;
  objectives: string[];
  keyOutcomes: string[];
}

export interface Quarter {
  quarter: number;
  focus: string;
  milestones: Milestone[];
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  learningObjectives: string[];
  expectedOutcomes: string[];
  progress?: number;
}

export interface YearPlan {
  overview: string;
  quarters: Quarter[];
  recommendations: string[];
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  metadata: {
    skillLevel: SkillLevel;
    totalHours: number;
    weeklyCommitment: number;
    preferredSchedule: {
      weekdays: boolean;
      weekends: boolean;
      timeOfDay: TimeOfDay;
    };
    tags?: string[];
    difficulty?: number;
    prerequisites?: string[];
  };
  progress: {
    completedTasks: number;
    totalTasks: number;
    completedMilestones: number;
    totalMilestones: number;
    lastUpdated: string; // ISO date string
  };
}

export interface PlanRequest {
  wsId: string;
  goals: string[];
  planDuration: number;
  skillLevel: SkillLevel;
  availability: number;
  learningStyle?: 'visual' | 'auditory' | 'reading' | 'kinesthetic';
  preferredSchedule?: {
    weekdays: boolean;
    weekends: boolean;
    timeOfDay: TimeOfDay;
  };
  focusAreas?: string[];
  existingSkills?: string[];
  dependencies?: string[];
  milestoneFrequency?: 'weekly' | 'monthly' | 'quarterly';
}

export type AdvancedSettings = Omit<PlanRequest, 'wsId' | 'goals'>;
