import { z } from 'zod';

// The internal API returns JSON but exposes this legacy field as unknown.
// Validate the transport value without dropping poll fields or inventing defaults.
export const meetPlanPolls = z.json();
