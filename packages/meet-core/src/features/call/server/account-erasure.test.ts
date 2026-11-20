import { expect, it } from 'vitest';
import {
  classifyAccountDelete,
  reconcileAccountErasure,
} from './account-erasure';

it('keeps an unknown account outcome pending and cancels only a definitive refusal', () => {
  expect(classifyAccountDelete(null)).toBe('deleted');
  expect(classifyAccountDelete({ status: 404 })).toBe('unknown');
  expect(classifyAccountDelete({ status: 500 })).toBe('unknown');
  expect(classifyAccountDelete({ status: 403 })).toBe('refused');
  expect(reconcileAccountErasure('absent', 'refused')).toBe('confirm');
  expect(reconcileAccountErasure('unknown', 'deleted')).toBe('pending');
  expect(reconcileAccountErasure('present', 'deleted')).toBe('pending');
  expect(reconcileAccountErasure('present', 'unknown')).toBe('pending');
  expect(reconcileAccountErasure('present', 'refused')).toBe('cancel');
});
