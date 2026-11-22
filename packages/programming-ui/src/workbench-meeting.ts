import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import type { WorkbenchCheck } from './code-diagnostics';
import type { WorkbenchMira } from './mira-code-presence';
import type { WorkbenchTestRun } from './workbench-meeting-output';

/** What a meeting adds to the workbench; Learn passes none of it. */
export interface WorkbenchMeeting {
  mira: WorkbenchMira;
  runTests?: (source: string) => Promise<WorkbenchTestRun>;
  onRuntime?: (language: PlaygroundLanguage) => void;
  runtimePending?: boolean;
  /** The runner refused a run while this coding panel was open, so Run starts disabled. */
  runnerUnavailable?: boolean;
  onRunnerUnavailable?: (unavailable: boolean) => void;
  /** Compiler problems for C, C++ and Java; absent where the host has no checker. */
  check?: WorkbenchCheck;
}
