import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addWhitelistEmail,
  fetchAdmins,
  fetchAllProblems,
  fetchSessionDetails,
  getFullSubmission,
} from './actions';

const supplier = vi.hoisted(() => ({
  addWhitelistEmail: vi.fn(),
  fetchAdmins: vi.fn(),
  fetchAllProblems: vi.fn(),
  fetchSessionDetails: vi.fn(),
  getFullSubmission: vi.fn(),
  sendOtpAction: vi.fn(),
  verifyOtpAction: vi.fn(),
}));
vi.mock('./actions.server', () => supplier);
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: <T>(schema: { parse(value: unknown): T }) => ({
      handler:
        <R>(handle: (input: { data: T }) => Promise<R>) =>
        ({ data }: { data: unknown }) =>
          handle({ data: schema.parse(data) }),
    }),
  }),
}));

const id = '6ab768a9-cd1d-41a2-ad88-632a7c3a08f9';
beforeEach(() => vi.clearAllMocks());

describe('Nova Start action adapters', () => {
  it('preserves supplier arguments, optional defaults and the returned result', async () => {
    supplier.fetchAdmins.mockResolvedValue({
      admins: ['manager@example.test'],
    });
    supplier.fetchAllProblems.mockResolvedValue({ problems: [] });
    supplier.fetchSessionDetails.mockResolvedValue({
      session: { id },
      problems: [],
    });
    supplier.getFullSubmission.mockResolvedValue({
      test_cases: [],
      criteria: [],
    });
    supplier.addWhitelistEmail.mockResolvedValue({ success: true });
    await expect(fetchAdmins()).resolves.toEqual({
      admins: ['manager@example.test'],
    });
    await expect(fetchAllProblems(id, id)).resolves.toEqual({ problems: [] });
    await expect(fetchSessionDetails(id, id)).resolves.toEqual({
      session: { id },
      problems: [],
    });
    await expect(getFullSubmission(id)).resolves.toEqual({
      test_cases: [],
      criteria: [],
    });
    await expect(addWhitelistEmail('new@example.test', false)).resolves.toEqual(
      { success: true }
    );
    expect(supplier.fetchAdmins).toHaveBeenCalledWith();
    expect(supplier.fetchAllProblems).toHaveBeenCalledWith(id, id);
    expect(supplier.fetchSessionDetails).toHaveBeenCalledWith(id, id);
    expect(supplier.getFullSubmission).toHaveBeenCalledWith(id, false);
    expect(supplier.addWhitelistEmail).toHaveBeenCalledWith(
      'new@example.test',
      false
    );
  });

  it('rejects malformed requests before loading a supplier and preserves authorization failures', async () => {
    expect(() => fetchAllProblems(id, 'bad-id')).toThrow();
    expect(() => getFullSubmission('bad-id')).toThrow();
    expect(supplier.fetchAllProblems).not.toHaveBeenCalled();
    expect(supplier.getFullSubmission).not.toHaveBeenCalled();
    supplier.addWhitelistEmail.mockRejectedValue(new Error('Forbidden'));
    await expect(addWhitelistEmail('new@example.test', false)).rejects.toThrow(
      'Forbidden'
    );
  });
});
