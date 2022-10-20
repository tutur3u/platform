import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/supabase';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
