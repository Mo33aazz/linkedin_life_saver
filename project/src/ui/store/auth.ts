import { writable, derived, get } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabaseConfig, supabaseUrl } from '../../shared/supabaseClient';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export const session = writable<Session | null>(null);
export const authStatus = writable<AuthStatus>('initializing');
export const authError = writable<string | null>(null);
export const pendingVerificationEmail = writable<string | null>(null);
export const resendCooldown = writable<number>(0);

export const currentUser = derived(session, ($session) => $session?.user ?? null);

let initialized = false;
let teardownListener: (() => void) | null = null;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const RESEND_COOLDOWN_SECONDS = 30;
const emailRedirectTarget = (() => {
  const raw = import.meta.env.VITE_SUPABASE_EMAIL_REDIRECT?.trim();
  if (raw) return raw;
  return supabaseUrl ?? undefined;
})();

function clearCooldownTimer() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function startResendCooldown(seconds: number) {
  clearCooldownTimer();
  resendCooldown.set(seconds);

  if (seconds <= 0) return;

  cooldownTimer = setInterval(() => {
    resendCooldown.update((value) => {
      if (value <= 1) {
        clearCooldownTimer();
        return 0;
      }
      return value - 1;
    });
  }, 1000);
}

export function clearPendingVerificationState() {
  pendingVerificationEmail.set(null);
  resendCooldown.set(0);
  clearCooldownTimer();
}

export async function initializeAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!hasSupabaseConfig) {
    authStatus.set('unauthenticated');
    authError.set('Supabase environment variables are not set.');
    return;
  }

  try {
    const {
      data: { session: initialSession },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    session.set(initialSession);
    authStatus.set(initialSession ? 'authenticated' : 'unauthenticated');

    if (initialSession) {
      clearPendingVerificationState();
    }
  } catch (error: unknown) {
    console.error('Failed to bootstrap Supabase auth session', error);
    authError.set(error instanceof Error ? error.message : 'Unknown authentication error');
    authStatus.set('unauthenticated');
  }

  const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
    session.set(newSession);
    authStatus.set(newSession ? 'authenticated' : 'unauthenticated');

    if (newSession) {
      clearPendingVerificationState();
      authError.set(null);
    }
  });

  teardownListener = () => {
    data?.subscription.unsubscribe();
  };
}

export async function signInWithPassword(email: string, password: string) {
  authError.set(null);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authError.set(error.message);

    const message = error.message.toLowerCase();
    if (message.includes('confirm')) {
      pendingVerificationEmail.set(email);
    }
    throw error;
  }
}

export async function signUpWithPassword(email: string, password: string) {
  authError.set(null);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTarget
      ? {
          emailRedirectTo: emailRedirectTarget,
        }
      : undefined,
  });
  if (error) {
    authError.set(error.message);
    if (error.message.toLowerCase().includes('already registered')) {
      pendingVerificationEmail.set(email);
    }
    throw error;
  }

  pendingVerificationEmail.set(email);
  resendCooldown.set(0);
  clearCooldownTimer();
}

export async function resendVerificationEmail() {
  authError.set(null);

  const email = get(pendingVerificationEmail);

  if (!email) {
    const error = new Error('No pending email to verify. Please enter your email above.');
    authError.set(error.message);
    throw error;
  }

  if (!hasSupabaseConfig) {
    const error = new Error('Supabase is not configured for this build.');
    authError.set(error.message);
    throw error;
  }

  if (get(resendCooldown) > 0) {
    return;
  }

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: emailRedirectTarget
      ? {
          emailRedirectTo: emailRedirectTarget,
        }
      : undefined,
  });

  if (error) {
    authError.set(error.message);
    throw error;
  }

  startResendCooldown(RESEND_COOLDOWN_SECONDS);
}

export async function signOut() {
  authError.set(null);
  const { error } = await supabase.auth.signOut();
  if (error) {
    authError.set(error.message);
    throw error;
  }
}

export function teardownAuth() {
  teardownListener?.();
  teardownListener = null;
  clearPendingVerificationState();
  initialized = false;
}
