/**
 * User Types - Based on existing Supabase schema
 * Schema: users table has (id, username)
 * Note: Email is stored in auth.users table only (not in public.users)
 */

export interface UsernameValidation {
  isValid: boolean;
  error?: string;
}
