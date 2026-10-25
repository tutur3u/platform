import { z } from 'zod';

const id = z.guid();

export const novaActionContracts = {
  addWhitelistEmail: z.tuple([z.email().max(320), z.boolean()]),
  fetchAdmins: z.tuple([]),
  fetchAllProblems: z.tuple([id, id]),
  fetchSessionDetails: z.tuple([id, id]),
  getFullSubmission: z.tuple([id, z.boolean().optional()]),
  sendOtpAction: z.tuple([z.strictObject({ email: z.email().max(320) })]),
  verifyOtpAction: z.tuple([
    z.strictObject({
      email: z.email().max(320),
      otp: z.string().min(1).max(128),
    }),
  ]),
};
