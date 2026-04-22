import { zodResolver as baseZodResolver } from '@hookform/resolvers/zod';

export const zodResolver = (schema: any, ...args: any[]) =>
  baseZodResolver(schema, ...(args as []));
