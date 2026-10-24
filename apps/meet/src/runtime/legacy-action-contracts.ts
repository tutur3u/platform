import { z } from 'zod';

const id = z.string();
const participant = z.object({
  userType: z.enum(['PLATFORM', 'GUEST']),
  guestId: z.string().optional(),
  guestSession: z.string().max(2048).optional(),
});

export const legacyActionSchemas = {
  guestLogin: z.tuple([
    id,
    z.object({ name: z.string(), password: z.string() }).strict(),
  ]),
  togglePlanLock: z.tuple([id, z.boolean()]),
  removeUserFromPlan: z.tuple([id, id]),
  createPoll: z.tuple([
    id,
    z
      .object({
        name: z.string(),
        allow_anonymous_updates: z.boolean().optional(),
      })
      .strict(),
  ]),
  deletePoll: z.tuple([id, id]),
  addPollOption: z.tuple([
    id,
    participant.extend({ pollId: id, value: z.string() }).strict(),
  ]),
  deletePollOption: z.tuple([
    id,
    id,
    z.object({ userType: z.enum(['PLATFORM', 'GUEST']) }).strict(),
  ]),
  submitVote: z.tuple([
    id,
    participant.extend({ pollId: id, optionIds: z.array(id) }).strict(),
  ]),
  toggleWherePoll: z.tuple([id, z.boolean()]),
};

export type LegacyActionName = keyof typeof legacyActionSchemas;
