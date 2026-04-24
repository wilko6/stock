import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const supabase = createClient(
  SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
