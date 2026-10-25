#!/usr/bin/env node
// Converts a Next satellite app to @tuturuuu/start-bridge.
//
//   node scripts/start-bridge-codemod/cli.mjs <app> [--apply] [--adopt]
//        [--hold] [--navigation router|document] [--json] [--report]
//
// Dry-run (default) prints a unified diff, the pending package commands and
// the generic page adapter coverage. `--apply` writes the same change set and
// runs the package commands. `--adopt` permits replacing unmarked hand-written
// files the codemod owns. `--hold` also writes the held production record
// (for an app's cutover-prep PR, not its conversion PR). Exit codes: 0 ok,
// 1 problems/conflicts, 2 usage.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBunCodegen } from './codegen.mjs';
import { unifiedDiff } from './diff.mjs';
import {
  createBiomeFormatter,
  pendingWrites,
  planConversion,
} from './plan.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export function parseArgs(argv) {
  const options = {
    apply: false,
    adopt: false,
    hold: false,
    json: false,
    report: false,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--adopt') options.adopt = true;
    else if (arg === '--hold') options.hold = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--report') options.report = true;
    else if (arg === '--no-format') options.noFormat = true;
    else if (arg === '--navigation') {
      const value = argv[++index];
      if (value !== 'router' && value !== 'document')
        throw new Error('--navigation must be router or document');
      options.navigation = value;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error('Expected exactly one app id');
  return { ...options, app: positional[0] };
}

export function coverageReport(plan) {
  const { coverage, pages } = plan.inventory;
  const lines = [
    `coverage ${plan.app}: ${coverage.generic}/${coverage.pages} pages on the generic adapter (${Math.round(coverage.ratio * 100)}%)`,
  ];
  for (const page of pages.filter((item) => !item.generic))
    lines.push(
      `  ${page.file}: ${page.blockers.map((blocker) => `${blocker.reason} (${blocker.file})`).join(', ')}`
    );
  return lines.join('\n');
}

export function applyPlan(repoRoot, plan, options = {}) {
  const run = options.spawn ?? spawnSync;
  for (const write of pendingWrites(plan)) {
    const full = path.join(repoRoot, write.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, write.content);
  }
  for (const removal of plan.removals ?? [])
    fs.rmSync(path.join(repoRoot, removal), { force: true });
  for (const command of plan.commands) {
    const result = run(command.argv[0], command.argv.slice(1), {
      cwd: path.join(repoRoot, command.cwd),
      stdio: 'inherit',
    });
    if (result.status !== 0)
      throw new Error(`${command.argv.join(' ')} failed in ${command.cwd}`);
  }
}

export function main(
  argv,
  io = { stdout: process.stdout, stderr: process.stderr },
  repoRoot = REPO_ROOT
) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
  const plan = planConversion(repoRoot, args.app, {
    navigation: args.navigation,
    hold: args.hold,
    codegen: createBunCodegen(repoRoot),
    // The codemod repository supplies Biome and its config for formatting.
    format: args.noFormat ? undefined : createBiomeFormatter(REPO_ROOT),
  });
  const pending = pendingWrites(plan);
  const conflicts = pending.filter((write) => write.conflict && !args.adopt);
  if (args.json) {
    io.stdout.write(
      `${JSON.stringify(
        {
          app: plan.app,
          coverage: plan.inventory.coverage,
          pages: plan.inventory.pages,
          writes: pending.map(({ path: file, status, owner, conflict }) => ({
            path: file,
            status,
            owner,
            conflict,
          })),
          commands: plan.commands,
          problems: plan.problems,
        },
        null,
        2
      )}\n`
    );
  } else if (!args.report) {
    for (const write of pending)
      io.stdout.write(unifiedDiff(write.path, write.before, write.content));
    for (const removal of plan.removals)
      io.stdout.write(`--- a/${removal}\n+++ /dev/null (moved)\n`);
    for (const command of plan.commands)
      io.stdout.write(`$ (cd ${command.cwd} && ${command.argv.join(' ')})\n`);
  }
  io.stdout.write(`${coverageReport(plan)}\n`);
  for (const problem of plan.problems) io.stderr.write(`problem: ${problem}\n`);
  for (const write of conflicts)
    io.stderr.write(
      `conflict: ${write.path} is hand-written; re-run with --adopt to replace it\n`
    );
  const blocked = plan.problems.length > 0 || conflicts.length > 0;
  if (args.apply && !blocked) {
    applyPlan(repoRoot, plan);
    io.stdout.write(
      `applied ${pending.length} file change(s) and ${plan.commands.length} command(s) to apps/${plan.app}\n`
    );
  } else if (!args.apply)
    io.stdout.write(
      `dry run: ${pending.length} file change(s), ${plan.removals.length} removal(s), ${plan.commands.length} command(s)${blocked ? '; blocked' : ''}\n`
    );
  return blocked ? 1 : 0;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  process.exitCode = main(process.argv.slice(2));
