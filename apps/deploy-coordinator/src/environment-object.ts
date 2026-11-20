import { DurableObject } from 'cloudflare:workers';
import {
  type CallContext,
  type Operation,
  runOperation,
} from './environment-service';
import { SqlEnvironmentStore } from './sql-store';

// One object per catalog project environment, named `${project}:${env}`.
// The single RPC runs synchronously against SQLite, so calls never
// interleave, and it does no other I/O, so an idle object can hibernate.
export class DeployEnvironment extends DurableObject<unknown> {
  #store = new SqlEnvironmentStore(this.ctx.storage.sql);

  call(context: CallContext, operation: Operation) {
    return runOperation(
      this.#store,
      (work) => this.ctx.storage.transactionSync(work),
      context,
      operation,
      Date.now(),
      () => crypto.randomUUID()
    );
  }
}
