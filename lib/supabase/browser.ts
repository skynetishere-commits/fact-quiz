'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let browserClient: SupabaseClient<Database> | undefined;

export class SupabaseConfigurationError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase is not configured. Missing public environment variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    );
    this.name = 'SupabaseConfigurationError';
  }
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) throw new SupabaseConfigurationError(missing);

  browserClient = createClient<Database>(url!, anonKey!);
  return browserClient;
}
