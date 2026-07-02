import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JSONContent } from '@tiptap/core';
import { decodeTaskDescriptionYjsState } from '@tuturuuu/utils/task-description-codec';
import { describe, expect, it } from 'vitest';
import {
  listLocalTaskTemplates,
  parseLocalTaskTemplateFile,
  taskTemplateToMarkdown,
  writeLocalTaskTemplate,
} from './task-templates';

function findNode(
  content: JSONContent | undefined,
  type: string
): JSONContent | undefined {
  if (!content) return undefined;
  if (content.type === type) return content;

  for (const child of content.content ?? []) {
    const match = findNode(child, type);
    if (match) return match;
  }
}

describe('CLI local task templates', () => {
  it('parses YAML frontmatter and markdown body into a task template payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-task-template-'));
    const file = join(dir, 'bug-report.md');
    await writeFile(
      file,
      `---
key: bug-report
name: Bug report
task_name: Investigate reported bug
visibility: workspace
priority: high
label_ids:
  - 11111111-1111-4111-8111-111111111111
assignee_ids:
  - 22222222-2222-4222-8222-222222222222
project_ids:
  - 33333333-3333-4333-8333-333333333333
---

## Checklist

- Reproduce the bug
- Capture expected behavior
`,
      'utf8'
    );

    const template = parseLocalTaskTemplateFile(file);

    expect(template.payload).toMatchObject({
      assignee_ids: ['22222222-2222-4222-8222-222222222222'],
      description: expect.stringContaining('Reproduce the bug'),
      key: 'bug-report',
      label_ids: ['11111111-1111-4111-8111-111111111111'],
      name: 'Bug report',
      priority: 'high',
      project_ids: ['33333333-3333-4333-8333-333333333333'],
      task_name: 'Investigate reported bug',
      visibility: 'workspace',
    });
  });

  it('generates TipTap Yjs state from local markdown template bodies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-task-template-table-'));
    const file = join(dir, 'handoff.md');
    await writeFile(
      file,
      `---
key: handoff
name: Handoff
task_name: Prepare handoff
---

| Field | Value |
| --- | --- |
| Owner | Platform |
`,
      'utf8'
    );

    const template = parseLocalTaskTemplateFile(file);
    const decoded = decodeTaskDescriptionYjsState(
      template.payload.description_yjs_state ?? []
    );

    expect(template.payload.description).toContain('| Field | Value |');
    expect(Array.isArray(template.payload.description_yjs_state)).toBe(true);
    expect(findNode(decoded, 'table')).toBeDefined();
  });

  it('lists .tuturuuu task template files and ignores other files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-task-template-list-'));
    const templateDir = join(dir, '.tuturuuu', 'task-templates');
    await mkdir(templateDir, { recursive: true });
    await writeFile(join(templateDir, 'one.md'), 'name: One\n', 'utf8');
    await writeFile(join(templateDir, 'two.txt'), 'ignored\n', 'utf8');

    const templates = listLocalTaskTemplates(dir);

    expect(templates).toHaveLength(1);
    expect(templates[0]?.payload.name).toBe('one');
  });

  it('exports task templates as markdown with frontmatter', async () => {
    const markdown = taskTemplateToMarkdown({
      assignee_ids: [],
      description: 'Default body',
      label_ids: ['label-1'],
      name: 'Release checklist',
      priority: 'normal',
      project_ids: [],
      task_name: 'Ship release',
      visibility: 'private',
    });

    expect(markdown).toContain('name: Release checklist');
    expect(markdown).toContain('task_name: Ship release');
    expect(markdown).toContain('Default body');
  });

  it('writes exported markdown to nested local template paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-task-template-write-'));
    const file = join(dir, '.tuturuuu', 'task-templates', 'release.md');

    writeLocalTaskTemplate(file, {
      description: 'Release steps',
      name: 'Release',
      task_name: 'Ship release',
      visibility: 'private',
    });

    await expect(readFile(file, 'utf8')).resolves.toContain('Release steps');
  });
});
