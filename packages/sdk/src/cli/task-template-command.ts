import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import type { CliConfig } from './config';
import { render } from './render';
import { selectListId } from './selection';
import {
  isLocalTaskTemplateReference,
  listLocalTaskTemplates,
  parseLocalTaskTemplateFile,
  resolveLocalTaskTemplatePath,
  taskTemplateToMarkdown,
  writeLocalTaskTemplate,
} from './task-templates';

export async function runTaskTemplateCliCommand({
  client,
  config,
  flags,
  json,
  workspaceId,
  action,
  firstId,
  positionalValue,
  helpers,
}: {
  client: TuturuuuUserClient;
  config: CliConfig;
  flags: Record<string, FlagValue>;
  json: boolean;
  workspaceId: string;
  action: string;
  firstId?: string;
  positionalValue: string;
  helpers: {
    getTaskTemplatePayloadFromFlags: typeof import('./commands').getTaskTemplatePayloadFromFlags;
    getTaskTemplateCreateOverrides: typeof import('./commands').getTaskTemplateCreateOverrides;
    createTaskFromLocalTemplate: typeof import('./commands').createTaskFromLocalTemplate;
  };
}) {
  const group = 'task-templates';
  const {
    getTaskTemplatePayloadFromFlags,
    getTaskTemplateCreateOverrides,
    createTaskFromLocalTemplate,
  } = helpers;

  if (action === 'list') {
    if (flags.local === true) {
      const localTemplates = listLocalTaskTemplates().map((template) => ({
        path: template.path,
        ...template.payload,
      }));
      render(localTemplates, { group, json });
      return true;
    }

    const payload = await client.tasks.listTemplates(workspaceId, {
      includeArchived: flags.all === true || flags.archived === true,
      q: getFlag(flags, 'q'),
      visibility: getFlag(flags, 'visibility') as never,
    });
    render(json ? payload : payload.templates, { group, json });
    return true;
  }

  if (action === 'show' || action === 'get') {
    if (!firstId) throw new Error('Missing task template key.');

    if (flags.local === true || isLocalTaskTemplateReference(firstId)) {
      render(
        parseLocalTaskTemplateFile(resolveLocalTaskTemplatePath(firstId)),
        {
          group,
          json,
        }
      );
      return true;
    }

    render(await client.tasks.getTemplate(workspaceId, firstId), {
      group,
      json,
    });
    return true;
  }

  if (action === 'create') {
    const payload = getTaskTemplatePayloadFromFlags(
      flags,
      positionalValue || 'Untitled Template'
    );

    if (flags.local === true || getFlag(flags, 'file')) {
      const file =
        getFlag(flags, 'file') ||
        resolveLocalTaskTemplatePath(
          String(
            getFlag(flags, 'key') || getFlag(flags, 'slug') || payload.name
          )
        );
      const path = writeLocalTaskTemplate(file, payload as never);
      render({ path, template: payload }, { group, json });
      return true;
    }

    render(await client.tasks.createTemplate(workspaceId, payload as never), {
      group,
      json,
    });
    return true;
  }

  if (action === 'update') {
    if (!firstId) throw new Error('Missing task template key.');
    render(
      await client.tasks.updateTemplate(
        workspaceId,
        firstId,
        getTaskTemplatePayloadFromFlags(flags) as never
      ),
      { group, json }
    );
    return true;
  }

  if (action === 'delete' || action === 'archive') {
    if (!firstId) throw new Error('Missing task template key.');
    render(
      await client.tasks.deleteTemplate(workspaceId, firstId, {
        permanent: flags.permanent === true,
      }),
      { group, json }
    );
    return true;
  }

  if (action === 'use') {
    if (!firstId) throw new Error('Missing task template key or file.');
    const listSelection = await selectListId(
      client,
      config,
      workspaceId,
      flags,
      json
    );

    if (flags.local === true || isLocalTaskTemplateReference(firstId)) {
      render(
        await createTaskFromLocalTemplate({
          client,
          flags,
          listId: listSelection.listId,
          reference: firstId,
          workspaceId,
        }),
        { group: 'tasks', json }
      );
      return true;
    }

    render(
      await client.tasks.useTemplate(
        workspaceId,
        firstId,
        getTaskTemplateCreateOverrides(
          flags,
          listSelection.listId,
          getFlag(flags, 'name')
        ) as never
      ),
      { group: 'tasks', json }
    );
    return true;
  }

  if (action === 'import') {
    if (!firstId) throw new Error('Missing local task template file.');
    const localTemplate = parseLocalTaskTemplateFile(
      resolveLocalTaskTemplatePath(firstId)
    );
    render(
      await client.tasks.createTemplate(workspaceId, {
        ...localTemplate.payload,
        ...getTaskTemplatePayloadFromFlags(flags),
      } as never),
      { group, json }
    );
    return true;
  }

  if (action === 'export') {
    if (!firstId) throw new Error('Missing task template key.');
    const { template } = await client.tasks.getTemplate(workspaceId, firstId);
    const file = getFlag(flags, 'file');
    if (file) {
      const path = writeLocalTaskTemplate(file, template);
      render({ path, template }, { group, json });
      return true;
    }

    process.stdout.write(taskTemplateToMarkdown(template));
    return true;
  }

  if (action === 'save-from-task') {
    const taskId =
      firstId || getFlag(flags, 'task') || getFlag(flags, 'task-id');
    if (!taskId) throw new Error('Missing task id.');
    render(
      await client.tasks.saveTemplateFromTask(workspaceId, {
        name: getFlag(flags, 'name') || getFlag(flags, 'template-name'),
        taskId,
        visibility: (getFlag(flags, 'visibility') as never) || 'private',
      }),
      { group, json }
    );
    return true;
  }

  return false;
}
