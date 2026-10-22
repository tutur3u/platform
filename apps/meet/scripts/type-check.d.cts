export const projects: { output: string; info: string }[];
export const manifest: string;
export function runWithDeclarationCache(options: {
  cwd: string;
  compile: () => number;
  projects?: { output: string; info: string }[];
  manifest?: string;
}): number;
