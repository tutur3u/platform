import { randomInt, randomUUID } from 'node:crypto';
import {
  EMPLOYEES_ENDPOINT,
  type EmployeesAdminClient,
  employeeCreationHeaders,
  employeeEmailSchema,
} from '../platform-employees';
import { type FlagValue, getFlag, isDryRun } from './args';
import {
  EMPLOYEE_PASSWORD,
  type EmployeeSecretStore,
  type EmployeeState,
} from './employees-secrets';
import { keychainAvailable, type PasswordStore } from './qa-users-secrets';

const SECRET_FLAGS = [
  'password',
  'temporary-password',
  'temporaryPassword',
  'token',
  'secret',
];
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!%+,.:=?@^_~-';

/** 32 characters from a CSPRNG with every class the server requires. */
export function generateEmployeePassword(length = 32) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)]!;
  for (;;) {
    const password =
      pick(LOWER + UPPER) +
      Array.from({ length: length - 1 }, () => pick(all)).join('');
    if (
      /[a-z]/u.test(password) &&
      /[A-Z]/u.test(password) &&
      /[0-9]/u.test(password) &&
      /[!%+,.:=?@^_~-]/u.test(password) &&
      EMPLOYEE_PASSWORD.test(password)
    )
      return password;
  }
}

export interface EmployeesCliOptions {
  client: () => EmployeesAdminClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  /** Positionals after `employees`: [action, ...args]. */
  positionals: string[];
}

export interface EmployeesCliDeps {
  secrets: EmployeeSecretStore;
  keychain: boolean;
  write: (text: string) => void;
  now: () => Date;
  newOperationId: () => string;
  newPassword: () => string;
}

function emit(
  deps: EmployeesCliDeps,
  json: boolean,
  value: unknown,
  human: string[]
) {
  deps.write(
    json ? `${JSON.stringify(value, null, 2)}\n` : `${human.join('\n')}\n`
  );
}

function refuseSecretFlags(flags: Record<string, FlagValue>) {
  if (SECRET_FLAGS.some((name) => Object.hasOwn(flags, name)))
    throw new Error(
      'Employee passwords are generated locally and never accepted from flags or argv.'
    );
}

function parseCreate(options: EmployeesCliOptions, deps: EmployeesCliDeps) {
  const args = options.positionals.slice(1);
  if (args.length !== 1)
    throw new Error('Pass exactly one @tuturuuu.com address.');
  const email = employeeEmailSchema.safeParse(args[0]?.trim().toLowerCase());
  if (!email.success)
    throw new Error(
      'The address must be a single lowercase @tuturuuu.com mailbox.'
    );
  const displayName = getFlag(options.flags, 'name')?.trim();
  if (!displayName || displayName.length > 100)
    throw new Error('Pass --name <display name> (1 to 100 characters).');
  const requested = getFlag(options.flags, 'password-store');
  if (requested && requested !== 'keychain' && requested !== 'file')
    throw new Error('--password-store must be keychain or file.');
  const store: PasswordStore =
    (requested as PasswordStore | undefined) ??
    (deps.keychain ? 'keychain' : 'file');
  if (store === 'keychain' && !deps.keychain)
    throw new Error(
      'macOS Keychain is unavailable; use --password-store file.'
    );
  return { email: email.data, displayName, store };
}

function summary(state: EmployeeState, extra: Record<string, unknown> = {}) {
  return {
    email: state.email,
    displayName: state.displayName,
    userId: state.userId,
    status: state.status,
    operationId: state.operationId,
    mailbox: state.status === 'created' ? 'active' : 'pending',
    credential: { store: state.store, location: state.location },
    ...extra,
  };
}

function stateLines(state: EmployeeState) {
  return [
    `${state.email}  ${state.userId ?? '(user id pending)'}  ${state.status}`,
    `Mailbox: ${state.status === 'created' ? 'active personal mailbox (provisioned with the account)' : 'pending'}`,
    `Operation: ${state.operationId}`,
    `Password stored in ${state.location}`,
  ];
}

async function dryRun(
  options: EmployeesCliOptions,
  deps: EmployeesCliDeps,
  input: ReturnType<typeof parseCreate>,
  existing: EmployeeState | undefined
) {
  // Read-only: one GET that proves admission. No store writes, no POST.
  let preflight: Record<string, unknown>;
  try {
    const result = await options.client().availability();
    preflight = result.ok
      ? { admitted: true, available: result.available }
      : { admitted: false, status: result.status };
  } catch (error) {
    preflight = { admitted: false, error: (error as Error).message };
  }
  const operationId = existing?.operationId ?? '<new random UUID>';
  const orphan = !existing && (await deps.secrets.hasPassword(input.email));
  const plan = {
    dryRun: true,
    action:
      existing?.status === 'created'
        ? 'none (already created)'
        : existing
          ? 'replay pending operation'
          : orphan
            ? 'refuse (a stored credential exists without a local operation)'
            : 'create',
    request: {
      method: 'POST',
      path: EMPLOYEES_ENDPOINT,
      headers: {
        Authorization: 'Bearer <ttr login session>',
        ...employeeCreationHeaders(operationId),
      },
      body: {
        email: input.email,
        displayName: input.displayName,
        temporaryPassword: '<generated locally; withheld>',
      },
    },
    credential: existing
      ? { store: existing.store, location: existing.location, reused: true }
      : {
          store: input.store,
          location:
            input.store === 'keychain'
              ? 'macOS Keychain (service tuturuuu-employee, account = address)'
              : deps.secrets.credentialPath(input.email),
          reused: false,
        },
    localState: existing ? summary(existing) : null,
    preflight,
  };
  emit(deps, options.json, plan, [
    `Dry run: would ${plan.action} ${input.email} ("${input.displayName}").`,
    `  POST ${EMPLOYEES_ENDPOINT}  Idempotency-Key ${operationId}`,
    `  Password: generated locally, stored in ${plan.credential.location} before sending; withheld here.`,
    `  Preflight GET: ${preflight.admitted ? `admitted, creation ${preflight.available ? 'available' : 'unavailable'}` : `not admitted (${preflight.status ?? preflight.error})`}`,
    'Nothing was sent or stored.',
  ]);
  if (!preflight.admitted || !preflight.available || orphan)
    process.exitCode = 1;
}

async function create(options: EmployeesCliOptions, deps: EmployeesCliDeps) {
  const input = parseCreate(options, deps);
  const dry = isDryRun(options.flags);
  const { secrets } = deps;
  const existing = await secrets.readState(input.email);
  if (existing && existing.displayName !== input.displayName)
    throw new Error(
      `${input.email} has a local operation for "${existing.displayName}"; rerun with that --name.`
    );
  if (dry) return dryRun(options, deps, input, existing);
  if (existing?.status === 'created') {
    emit(deps, options.json, summary(existing, { existing: true }), [
      'Already created; nothing sent and the stored password is unchanged.',
      ...stateLines(existing),
    ]);
    return;
  }

  let state: EmployeeState;
  let password: string | undefined;
  let freshCredential = false;
  if (existing) {
    // Replays the same operation with the same password; never a new one.
    state = existing;
    password = await secrets.readPassword(existing.email, existing.store);
    if (!password)
      throw new Error(
        `The stored password for pending operation ${existing.operationId} is missing; inspect ${existing.location} before retrying.`
      );
  } else {
    if (await secrets.hasPassword(input.email))
      throw new Error(
        `A stored credential for ${input.email} already exists without a local operation; not overwriting it. Inspect it first.`
      );
    // Nothing is generated or stored unless the server admits this session
    // and its creation runtime is available.
    const preflight = await options.client().availability();
    if (!preflight.ok)
      throw new Error(
        `Employee creation is not admitted for this session (HTTP ${preflight.status}); nothing was stored or sent. It needs CLI employee creation enabled on the server and a \`ttr login\` session with MFA from a staff root member holding manage_internal_accounts.`
      );
    if (!preflight.available)
      throw new Error(
        'Employee creation is unavailable on the server; nothing was stored or sent.'
      );
    state = {
      version: 1,
      email: input.email,
      displayName: input.displayName,
      operationId: deps.newOperationId(),
      status: 'pending',
      userId: null,
      store: input.store,
      location: 'pending',
      updatedAt: deps.now().toISOString(),
    };
    // Exclusive claim: a concurrent run for the same address stops here.
    await secrets.claimState(state);
    password = deps.newPassword();
    let stored: Awaited<ReturnType<typeof secrets.storePassword>>;
    try {
      stored = await secrets.storePassword(input.email, password, input.store);
    } catch (error) {
      await secrets.removeState(input.email);
      throw error;
    }
    freshCredential = true;
    state = { ...state, store: stored.store, location: stored.location };
    await secrets.writeState(state);
    if (stored.store !== input.store)
      process.stderr.write(
        `Warning: the ${input.store} store failed; the password is in ${stored.location} instead.\n`
      );
  }

  const result = await options.client().create(
    {
      email: state.email,
      displayName: state.displayName,
      temporaryPassword: password,
    },
    state.operationId
  );
  password = undefined;

  if (result.status === 'created') {
    state = {
      ...state,
      status: 'created',
      userId: result.account.id,
      updatedAt: deps.now().toISOString(),
    };
    await secrets.writeState(state);
    emit(deps, options.json, summary(state), [
      'Created.',
      ...stateLines(state),
    ]);
    return;
  }
  if (result.status === 'conflict') {
    // A final answer for this operation: nothing was created under it.
    if (freshCredential) await secrets.removePassword(state.email, state.store);
    await secrets.removeState(state.email);
    emit(
      deps,
      options.json,
      {
        email: state.email,
        status: 'exists',
        code: result.code,
        operationId: state.operationId,
      },
      [
        result.code === 'employee_account_conflict'
          ? `${state.email} already exists (or its address is reserved); nothing was created.`
          : `Operation ${state.operationId} conflicts with an earlier payload; nothing was created.`,
        freshCredential
          ? 'The password generated for this attempt was discarded; no stored password was changed.'
          : 'No stored password was changed.',
      ]
    );
    process.exitCode = 1;
    return;
  }
  if (
    result.status === 'not_admitted' &&
    result.reason === 'invalid_input' &&
    freshCredential
  ) {
    // Proven unclaimed and unfixable by a replay: discard this attempt.
    await secrets.removePassword(state.email, state.store);
    await secrets.removeState(state.email);
    emit(
      deps,
      options.json,
      {
        email: state.email,
        status: 'rejected',
        reason: result.reason,
        operationId: state.operationId,
      },
      [
        `The server rejected the request as invalid input; nothing was created.`,
        'The password generated for this attempt was discarded.',
      ]
    );
    process.exitCode = 1;
    return;
  }
  emit(
    deps,
    options.json,
    summary(state, {
      status: result.status,
      ...('code' in result ? { code: result.code } : {}),
      ...('reason' in result ? { reason: result.reason } : {}),
    }),
    [
      result.status === 'pending'
        ? `Creation is pending (${result.code}).`
        : `This request was not admitted (${result.reason}); it claimed nothing.`,
      ...stateLines(state),
      result.status === 'not_admitted' && result.reason === 'invalid_input'
        ? 'A replay cannot fix invalid input. An earlier attempt of this operation may still need readback; inspect it in the admin app before removing the local state.'
        : 'Rerun the same command to replay this operation with the same stored password.',
    ]
  );
  process.exitCode = 1;
}

export async function runEmployeesCommand(
  options: EmployeesCliOptions,
  deps: EmployeesCliDeps
) {
  refuseSecretFlags(options.flags);
  const [action] = options.positionals;
  if (!action) return deps.write(employeesHelp());
  if (action === 'create') return create(options, deps);
  throw new Error(
    `Unknown employees command: ${action}. Run \`ttr employees --help\`.`
  );
}

export function defaultEmployeesDeps(
  secrets: EmployeeSecretStore
): EmployeesCliDeps {
  return {
    secrets,
    keychain: keychainAvailable(),
    write: (text) => process.stdout.write(text),
    now: () => new Date(),
    newOperationId: randomUUID,
    newPassword: () => generateEmployeePassword(),
  };
}

export function employeesHelp() {
  return `Staff employees (root permission manage_internal_accounts)

  ttr employees create <address@tuturuuu.com> --name <display name>
      [--password-store keychain|file] [--dry-run] [--json]

Creates a confirmed staff account with an active personal @tuturuuu.com
mailbox, as the admin app's "Create employee" does. The password is generated
locally, stored first in the macOS Keychain (service tuturuuu-employee,
account = address) or a 0600 file under ~/.tuturuuu/employees, and sent only in
the request body. It is never read from flags and never printed.
Rerunning replays a pending operation with the same password; an account that
was already created is reported and its stored password is left unchanged.
Every run first checks admission with a read-only GET; --dry-run stops there
and writes no credential or operation state.
The server must enable CLI employee creation, and the ttr login session must
carry an MFA proof. Creates are limited to 5 per hour per operator.
Rollback: disable the account in the admin app (Internal accounts > Disable
access). The CLI has no employee disable command.
`;
}
