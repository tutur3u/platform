import { Session } from '@supabase/supabase-js';
import { Error } from './Error';

export type AuthRequest = {
  handle?: string;
  email?: string;
  password?: string;
  otp?: string;
};

export type AuthResponse = {
  session?: Session | null;
  error?: Error;
};
