import type { Json } from './supabase';

export type JSONContent = {
  type?: string;
  attrs?: { [key: string]: Json | undefined };
  content?: JSONContent[];
  marks?: Array<{
    type: string;
    attrs?: { [key: string]: Json | undefined };
  }>;
  text?: string;
};
