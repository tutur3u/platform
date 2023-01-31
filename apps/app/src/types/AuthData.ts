import { Session } from '@supabase/supabase-js';
import { Error } from './Error';

export type AuthRequest = {
  username?: string;
  email?: string;
  password: string;
};

export type AuthResponse = {
  session?: Session | null;
  error?: Error;
};
