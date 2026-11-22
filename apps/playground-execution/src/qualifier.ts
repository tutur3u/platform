import { DurableObject } from 'cloudflare:workers';
import {
  PLAYGROUND_LANGUAGES,
  type PlaygroundLanguage,
} from '@tuturuuu/types/primitives/playgrounds';
import { playgroundTemplates } from '@tuturuuu/utils/playground-templates';
import { LAUNCHER, readGuestStream } from './container-run';
import type { Env } from './environment';

// Staging-only hosted qualification. It runs fixed fixture jobs, never request
// input, through the same exec, launcher and sandbox as production Runs and
// checks, in one fresh guest that is destroyed at the end.
const READY_TIMEOUT_MS = 90_000;
const CASE_TIMEOUT_MS = 45_000;

type Job = Record<string, unknown>;
interface Case {
  name: string;
  job: Job;
  pass: (result: GuestReport) => boolean;
}
interface GuestReport {
  exitCode?: number;
  output?: string;
  outcome?: string;
  files?: { path: string; content: string }[] | null;
}
export interface CaseResult {
  name: string;
  passed: boolean;
  ms: number;
  outcome?: string;
  exitCode?: number;
  output?: string;
}
export interface QualificationReport {
  passed: boolean;
  coldStartMs: number;
  guest: string;
  cases: CaseResult[];
  stopped: boolean;
}

const python = (source: string, stdin = '') => ({
  command: 'python3 main.py',
  files: [{ path: 'main.py', content: source }],
  stdin,
});

function cases(): Case[] {
  const templates = PLAYGROUND_LANGUAGES.map((language: PlaygroundLanguage) => {
    const { path, content, command } = playgroundTemplates[language];
    return {
      name: `template:${language}`,
      job: { command, files: [{ path, content }], stdin: '' },
      pass: (r: GuestReport) =>
        r.outcome === 'exited' &&
        r.exitCode === 0 &&
        r.output?.trim() === 'Hello, playground!',
    };
  });
  return [
    ...templates,
    {
      name: 'stdin',
      job: python('print(input()[::-1])\n', 'dlrow\n'),
      pass: (r) => r.outcome === 'exited' && r.output?.trim() === 'world',
    },
    {
      name: 'identity',
      job: python(
        [
          'import os',
          'from pathlib import Path',
          's = dict(l.split(":", 1) for l in Path("/proc/self/status").read_text().splitlines())',
          'caps = [int(s[k], 16) for k in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb")]',
          'print(os.getuid(), os.getgid(), os.getgroups(), caps, s["NoNewPrivs"].strip())',
        ].join('\n')
      ),
      pass: (r) =>
        r.outcome === 'exited' &&
        r.output?.trim() === '65534 65534 [] [0, 0, 0, 0, 0] 1',
    },
    {
      name: 'egress',
      job: python(
        [
          'import socket',
          'reached = []',
          'for host, port in (("1.1.1.1", 53), ("1.1.1.1", 443), ("8.8.8.8", 443), ("169.254.169.254", 80), ("10.0.0.1", 80), ("172.16.0.1", 80), ("192.168.0.1", 80)):',
          '    s = socket.socket(); s.settimeout(2)',
          '    try:',
          '        s.connect((host, port)); reached.append(f"{host}:{port}")',
          '    except OSError:',
          '        pass',
          '    finally:',
          '        s.close()',
          'try:',
          '    socket.getaddrinfo("example.com", 443); reached.append("dns")',
          'except OSError:',
          '    pass',
          'print("reached", reached)',
        ].join('\n')
      ),
      pass: (r) => r.outcome === 'exited' && r.output?.trim() === 'reached []',
    },
    {
      name: 'writes',
      job: python(
        [
          'denied = 0',
          'for target in ("/etc/x", "/usr/local/lib/playground/run.py", "/var/tmp/x", "/root/x", "/dev/shm/x"):',
          '    try:',
          '        open(target, "a").write("x")',
          '    except OSError:',
          '        denied += 1',
          'open("/tmp/workspace/out.txt", "w").write("kept\\n")',
          'print(denied)',
        ].join('\n')
      ),
      pass: (r) =>
        r.outcome === 'exited' &&
        r.output?.trim() === '5' &&
        !!r.files?.some(
          ({ path, content }) => path === 'out.txt' && content === 'kept\n'
        ),
    },
    {
      name: 'timeout',
      job: python('import time\ntime.sleep(120)\n'),
      pass: (r) => r.outcome === 'timeout' && r.exitCode === 124,
    },
    {
      name: 'output-limit',
      job: { command: 'yes', files: [], stdin: '' },
      pass: (r) =>
        r.outcome === 'output_limit' &&
        new TextEncoder().encode(r.output ?? '').byteLength <= 64 * 1024,
    },
    {
      name: 'process-limit',
      job: python(
        [
          'import os, time',
          'children = 0',
          'try:',
          '    for _ in range(1000):',
          '        if os.fork() == 0:',
          '            time.sleep(60); os._exit(0)',
          '        children += 1',
          'except OSError:',
          '    pass',
          'print(children < 128, flush=True)',
          'os._exit(0)',
        ].join('\n')
      ),
      pass: (r) => r.outcome === 'exited' && r.output?.trim() === 'True',
    },
    ...(
      [
        ['c', 'main.c', 'int main(void) { return y; }\n', "'y' undeclared"],
        [
          'cpp',
          'main.cpp',
          '#include <vector>\nint main() { std::vector<int> v; v.nope(); }\n',
          'nope',
        ],
        [
          'java',
          'Main.java',
          'class Main { void f() { int x = "s"; } }\n',
          'incompatible types',
        ],
      ] as const
    ).map(([language, path, content, expected]) => ({
      name: `check:${language}`,
      job: {
        mode: 'check',
        language,
        files: [{ path, content }],
        sources: [path],
      },
      pass: (r: GuestReport) =>
        r.outcome === 'exited' && !!r.output?.includes(expected),
    })),
  ];
}

const excerpt = (text?: string) =>
  text === undefined ? undefined : text.slice(0, 400);

export class PlaygroundQualifier extends DurableObject<Env> {
  private inProgress = false;

  private async exec(command: string[], stdin?: string, user = '0:0') {
    const container = this.ctx.container!;
    const process = await container.exec(command, {
      user,
      ...(stdin === undefined ? {} : { stdin: new Blob([stdin]).stream() }),
      stderr: 'combined',
      signal: AbortSignal.timeout(CASE_TIMEOUT_MS),
    });
    const [output, exitCode] = await Promise.all([
      readGuestStream(process.stdout, 512 * 1024),
      process.exitCode,
    ]);
    return { output, exitCode };
  }

  /** Null while another qualification still owns the guest. */
  async qualify(): Promise<QualificationReport | null> {
    if (this.inProgress) return null;
    this.inProgress = true;
    try {
      return await this.run();
    } finally {
      this.inProgress = false;
    }
  }

  private async run(): Promise<QualificationReport> {
    const container = this.ctx.container;
    const image = container?.images.toolchain;
    if (!container || !image) throw new Error('Qualifier container missing');
    if (container.running) await container.destroy();
    const started = Date.now();
    container.start({ image, enableInternet: false, instance: 'standard-1' });
    let guest = '';
    for (;;) {
      try {
        // The guest's own view, as root and before any sandbox: identity,
        // capabilities and the kernel's security modules.
        guest = (
          await this.exec([
            '/bin/sh',
            '-c',
            'id; grep -E "^(Cap(Eff|Bnd)|NoNewPrivs)" /proc/self/status; cat /sys/kernel/security/lsm; uname -r',
          ])
        ).output;
        break;
      } catch {
        if (Date.now() - started > READY_TIMEOUT_MS)
          throw new Error('Qualifier guest never became ready');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    const coldStartMs = Date.now() - started;
    const results: CaseResult[] = [];
    try {
      for (const { name, job, pass } of cases()) {
        const begin = Date.now();
        try {
          const { output } = await this.exec(LAUNCHER, JSON.stringify(job));
          const report = JSON.parse(output) as GuestReport;
          results.push({
            name,
            passed: pass(report),
            ms: Date.now() - begin,
            outcome: report.outcome,
            exitCode: report.exitCode,
            output: excerpt(report.output),
          });
        } catch (error) {
          results.push({
            name,
            passed: false,
            ms: Date.now() - begin,
            output: excerpt(error instanceof Error ? error.message : 'failed'),
          });
        }
      }
    } finally {
      if (container.running) await container.destroy();
    }
    return {
      passed: results.every(({ passed }) => passed),
      coldStartMs,
      guest: guest.slice(0, 2000),
      cases: results,
      stopped: !container.running,
    };
  }
}
