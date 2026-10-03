export const PLAYGROUND_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'c',
  'cpp',
  'java',
  'rust',
  'go',
  'ruby',
  'php',
  'shell',
] as const;
export type PlaygroundLanguage = (typeof PLAYGROUND_LANGUAGES)[number];
export interface PlaygroundFile {
  path: string;
  content: string;
}
export interface PlaygroundProject {
  id: string;
  name: string;
  language: PlaygroundLanguage;
  revision: number;
  drivePath: string | null;
  files: PlaygroundFile[];
  command: string;
  activeRun: { id: string; status: string } | null;
}
export interface PlaygroundIndex {
  actorId: string;
  personalWorkspaceId: string;
  allowed: boolean;
  projects: Omit<PlaygroundProject, 'files'>[];
  languages: PlaygroundLanguage[];
}
export interface PlaygroundExecutionResult {
  runId: string;
  status: string;
  exitCode: number | null;
  output: string;
  revision: number;
  saved: boolean;
}
export interface AccountBenefit {
  id: string;
  user_id: string;
  benefit_key: string;
  amount: number;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  reason: string;
  granted_by: string;
  created_at: string;
}
