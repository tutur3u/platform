import { z } from 'zod';

export const PROJECT_TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
export const projectTicketKeySchema = z
  .string()
  .regex(
    PROJECT_TICKET_KEY_PATTERN,
    'Key must contain 2–10 uppercase letters or digits and start with a letter'
  );
