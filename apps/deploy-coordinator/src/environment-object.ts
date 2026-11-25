import { DurableObject } from 'cloudflare:workers';
import { type CiOperation, runCiOperation } from './ci-registry';
import { SqlCiStore } from './ci-store';
import {
  type CallContext,
  type Operation,
  runOperation,
} from './environment-service';
import { SqlEnvironmentStore } from './sql-store';

// One object per catalog project environment, named `${project}:${env}`,
// plus the main-branch CI registry, named `ci:main`. Each store creates its
// tables on first use, so an object holds only the tables it serves. The RPCs
// run synchronously against SQLite, so calls never interleave, and they do no
// other I/O, so an idle object can hibernate.
export class DeployEnvironment extends DurableObject<unknown> {
  #store: SqlEnvironmentStore | undefined;
  #ciStore: SqlCiStore | undefined;

  call(context: CallContext, operation: Operation) {
    this.#store ??= new SqlEnvironmentStore(this.ctx.storage.sql);
    return runOperation(
      this.#store,
      (work) => this.ctx.storage.transactionSync(work),
      context,
      operation,
      Date.now(),
      () => crypto.randomUUID()
    );
  }

  ci(operation: CiOperation) {
    this.#ciStore ??= new SqlCiStore(this.ctx.storage.sql);
    return runCiOperation(
      this.#ciStore,
      (work) => this.ctx.storage.transactionSync(work),
      operation,
      Date.now()
    );
  }
}
