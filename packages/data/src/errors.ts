// Errors raised by the scoped data client. Only the code and status are meant
// to cross a binding; messages stay inside the Worker.

export type DataErrorCode =
  | 'not_found'
  | 'forbidden'
  /** The query builder or a guard refused the statement before execution. */
  | 'refused'
  /** The per-invocation query budget would be exceeded. */
  | 'budget_exceeded';

const STATUS: Record<DataErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  refused: 500,
  budget_exceeded: 503,
};

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly status: number;

  constructor(code: DataErrorCode, message: string = code) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.status = STATUS[code];
  }
}

export const refuse = (message: string): never => {
  throw new DataError('refused', message);
};
