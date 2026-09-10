export type TraceStatus = 'success' | 'error';
export type RunStopReason = 'answered' | 'tool_limit' | 'turn_limit';

export type Trace = {
  tool: string;
  input: string;
  output: string;
  status?: TraceStatus;
};

export type RunUsage = {
  turns: number;
  toolCalls: number;
  turnLimit: number;
  toolCallLimit: number;
  successfulToolCalls?: number;
  failedToolCalls?: number;
  writeToolCalls?: number;
  stopReason?: RunStopReason;
};

export type Run = {
  id: string;
  at: number;
  prompt: string;
  scenario: string;
  answer: string;
  trace: Trace[];
  feedback: string;
  usage?: RunUsage;
};
