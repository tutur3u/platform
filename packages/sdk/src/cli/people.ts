import {
  createPerson,
  getPeopleRegistryControl,
  getPerson,
  listPeople,
  type PeopleRegistryResponse,
  writePersonResource,
  writeRegistrySetting,
} from '@tuturuuu/internal-api/people-registry';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import { maskDisplay, readSensitiveValue } from './people-input';

// `ttr people` drives the people registry manager routes with the CLI
// session. Raw external IDs are never arguments: `link` reads them from a
// hidden prompt or standard input, and output shows display values masked.
// See apps/docs/platform/features/people-registry.mdx#cli.

type Options = {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
};

function write(text: string) {
  process.stdout.write(`${text}\n`);
}

function unwrap<T>(result: PeopleRegistryResponse<T>) {
  if (!result.ok)
    throw new Error(
      `People registry refused (${result.status}): ${result.error}`
    );
  return result.data;
}

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name}. Run ttr people --help.`);
  return value;
}

// `--rev new` (or no flag) targets a record that does not exist yet.
function revision(flags: Record<string, FlagValue>) {
  const raw = getFlag(flags, 'rev');
  if (raw === undefined || raw === 'new') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error('--rev must be a positive revision or "new".');
  return value;
}

function parseValue(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function summarizePerson(person: Awaited<ReturnType<typeof showPerson>>) {
  const lines = [
    `${person.label ?? '(withheld)'}  ${person.kind ?? ''}  ${person.status}  v${person.version}`,
    `  id ${person.id}`,
  ];
  for (const identity of person.identities ?? []) {
    lines.push(
      `  ${identity.channel}/${identity.providerAccountId}  ${maskDisplay(identity.displayValue)}  ${identity.linkState}  ${identity.verification}  ${identity.id}`
    );
  }
  for (const fact of person.facts ?? []) {
    lines.push(
      `  fact ${String(fact.key)} = ${String(fact.value)}  rev ${String(fact.revision)}`
    );
  }
  for (const rule of person.rules ?? []) {
    lines.push(
      `  rule ${String(rule.rule)} = ${JSON.stringify(rule.value)}  rev ${String(rule.revision)}`
    );
  }
  for (const consent of person.consents ?? []) {
    lines.push(`  consent ${String(consent.store)} ${String(consent.state)}`);
  }
  for (const relationship of person.relationships ?? []) {
    lines.push(
      `  relationship ${String(relationship.kind)} ${String(relationship.otherPersonId ?? relationship.toPersonId ?? '')}`
    );
  }
  return lines.join('\n');
}

async function showPerson(options: Options, personId: string) {
  return unwrap(
    await getPerson(
      options.workspaceId,
      personId,
      options.client.getClientOptions()
    )
  );
}

async function writeResource(
  options: Options,
  personId: string,
  resource: Parameters<typeof writePersonResource>[2],
  body: Record<string, unknown>,
  method?: 'PUT' | 'POST' | 'PATCH'
) {
  return unwrap(
    await writePersonResource(
      options.workspaceId,
      personId,
      resource,
      body,
      options.client.getClientOptions(),
      method
    )
  );
}

export async function runPeopleCommand(options: Options) {
  const { flags, json, positionals } = options;
  const [action = 'ls', ...args] = positionals;
  const clientOptions = options.client.getClientOptions();
  const emit = (value: unknown, text: string) =>
    write(json ? JSON.stringify(value, null, 2) : text);

  if (action === 'ls' || action === 'search') {
    const q =
      action === 'search'
        ? required(args.join(' ').trim(), 'search text')
        : undefined;
    const limit = getFlag(flags, 'limit');
    const persons = unwrap(
      await listPeople(
        options.workspaceId,
        {
          q,
          limit: limit ? Number(limit) : undefined,
          after: getFlag(flags, 'after'),
        },
        clientOptions
      )
    );
    emit(
      persons,
      persons.length
        ? persons
            .map(
              (person) =>
                `${person.id}  ${person.label}  ${person.kind}  ${person.status}  ids:${person.identityCount}${person.isOwner ? '  owner' : ''}`
            )
            .join('\n')
        : 'No people found.'
    );
    return;
  }

  if (action === 'show') {
    const person = await showPerson(options, required(args[0], 'person id'));
    emit(person, summarizePerson(person));
    return;
  }

  if (action === 'status') {
    const control = unwrap(
      await getPeopleRegistryControl(options.workspaceId, clientOptions)
    );
    emit(
      control,
      `owner:${control.isOwner} capture:${control.captureEnabled} personal-sessions:${control.personalSessionsEnabled} stopped:${control.stopped} generation:${control.generation}`
    );
    return;
  }

  if (action === 'add') {
    const label = required(args.join(' ').trim(), 'label');
    const kind =
      getFlag(flags, 'kind') === 'organisation' ? 'organisation' : 'person';
    const created = unwrap(
      await createPerson(options.workspaceId, { label, kind }, clientOptions)
    );
    emit(created, `Created ${created.id}`);
    return;
  }

  if (action === 'link') {
    const personId = required(args[0], 'person id');
    const externalId = await readSensitiveValue('External ID (hidden): ');
    const result = await writeResource(options, personId, 'identities', {
      channel: required(getFlag(flags, 'channel'), '--channel'),
      account: required(getFlag(flags, 'account'), '--account'),
      externalId,
      basis: getFlag(flags, 'basis') ?? 'owner_statement',
    });
    emit(result, `Identity ${String(result.reason ?? 'proposed')}`);
    return;
  }

  if (action === 'confirm' || action === 'reject') {
    const result = await writeResource(
      options,
      required(args[0], 'person id'),
      'identities',
      {
        identityId: required(args[1], 'identity id'),
        state: action === 'confirm' ? 'confirmed' : 'rejected',
      },
      'PATCH'
    );
    emit(result, `Identity ${String(result.reason ?? action)}`);
    return;
  }

  if (action === 'relate') {
    const [from, kind, to] = args;
    const result = await writeResource(
      options,
      required(from, 'from person id'),
      'relationships',
      {
        otherPersonId: required(to, 'to person id'),
        kind: required(kind, 'relationship kind'),
        label: getFlag(flags, 'label'),
        remove: flags.remove === true,
      }
    );
    emit(result, `Relationship ${String(result.reason ?? 'updated')}`);
    return;
  }

  if (action === 'fact') {
    const [verb, personId, key, ...value] = args;
    if (verb !== 'set' && verb !== 'rm')
      throw new Error('Use ttr people fact set|rm. Run ttr people --help.');
    const result = await writeResource(
      options,
      required(personId, 'person id'),
      'facts',
      {
        key: required(key, 'fact key'),
        ...(verb === 'set'
          ? { value: required(value.join(' ').trim(), 'fact value') }
          : {}),
        baseRevision: revision(flags),
        remove: verb === 'rm',
      }
    );
    emit(result, `Fact ${String(result.reason ?? 'updated')}`);
    return;
  }

  if (action === 'rules') {
    const [verb, scope, rule, raw] = args;
    if (verb !== 'set' && verb !== 'rm')
      throw new Error('Use ttr people rules set|rm. Run ttr people --help.');
    const personId = getFlag(flags, 'person');
    const body = {
      scope: required(scope, 'rule scope'),
      rule: required(rule, 'rule'),
      channel: getFlag(flags, 'channel'),
      conversationId: getFlag(flags, 'conversation'),
      ...(verb === 'set'
        ? { value: parseValue(required(raw, 'rule value')) }
        : {}),
      expiresAt: getFlag(flags, 'expires'),
      baseRevision: revision(flags),
      remove: verb === 'rm',
    };
    if (scope !== 'person')
      throw new Error(
        'This CLI sets person rules; use --person <id> with scope person.'
      );
    const result = await writeResource(
      options,
      required(personId, '--person'),
      'rules',
      body
    );
    emit(result, `Rule ${String(result.reason ?? 'updated')}`);
    return;
  }

  if (action === 'consent') {
    const [verb, personId, store, state] = args;
    if (verb !== 'set')
      throw new Error('Use ttr people consent set. Run ttr people --help.');
    const note = getFlag(flags, 'note');
    const result = await writeResource(
      options,
      required(personId, 'person id'),
      'consents',
      {
        store: required(store, 'store'),
        state: required(state, 'state'),
        basis: getFlag(flags, 'basis'),
        evidence: note ? { note } : {},
      }
    );
    emit(result, `Consent ${String(result.reason ?? 'updated')}`);
    return;
  }

  if (action === 'flags') {
    const toggle = (name: string) => {
      const value = getFlag(flags, name);
      if (value === undefined) return undefined;
      if (value !== 'on' && value !== 'off')
        throw new Error(`--${name} takes on or off.`);
      return value === 'on';
    };
    const result = unwrap(
      await writeRegistrySetting(
        options.workspaceId,
        'flags',
        { captureEnabled: toggle('capture'), stopped: toggle('stop') },
        clientOptions
      )
    );
    emit(result, `Flags ${String(result.reason ?? 'updated')}`);
    return;
  }

  throw new Error('Unknown people command. Run ttr people --help.');
}

export function peopleHelp() {
  return `People registry (registry owner or managers)

  ttr people ls [--limit n] [--after id]       list people
  ttr people search <text>                     search by label
  ttr people show <id>                         identities, facts, rules, consent
  ttr people status                            registry switches
  ttr people add <label> [--kind organisation]
  ttr people link <id> --channel <c> --account <a> [--basis owner_statement]
                                               external ID from a hidden prompt or stdin
  ttr people confirm|reject <id> <identity-id>
  ttr people relate <from> <kind> <to> [--label text] [--remove]
  ttr people fact set <id> <key> <value> [--rev n|new]
  ttr people fact rm <id> <key> --rev n
  ttr people rules set person <rule> <json-value> --person <id> [--expires iso] [--rev n|new]
  ttr people consent set <id> <profile|memory|capture> <state> --basis <b> [--note text]
  ttr people flags [--capture on|off] [--stop on|off]   owner only

Every command takes --workspace and --json. Display values are masked.`;
}
