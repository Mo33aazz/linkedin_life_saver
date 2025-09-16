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

const PENDING_VERIFICATION_STORAGE_KEY = 'lea.auth.pendingVerification';

type StoredPendingVerificationState = {
  email: string;
  cooldownUntil: number | null;
};

export type SignUpResult =
  | { status: 'created'; email: string }
  | { status: 'resent'; email: string }
  | { status: 'already-confirmed'; message: string }
  | { status: 'already-exists'; message: string }
  | { status: 'resend-rate-limited'; message: string; retryIn?: number }
  | { status: 'resend-error'; message: string };

const safeLocalStorage = (() => {
  if (typeof globalThis === 'undefined') return null;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probeKey = '__lea__auth_probe__';
    storage.setItem(probeKey, probeKey);
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
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

function persistPendingVerificationState(state: StoredPendingVerificationState | null) {
  if (!safeLocalStorage) return;
  if (state) {
    safeLocalStorage.setItem(PENDING_VERIFICATION_STORAGE_KEY, JSON.stringify(state));
  } else {
    safeLocalStorage.removeItem(PENDING_VERIFICATION_STORAGE_KEY);
  }
}

function restorePendingVerificationState() {
  if (!safeLocalStorage) return;

  try {
    const raw = safeLocalStorage.getItem(PENDING_VERIFICATION_STORAGE_KEY);
    if (!raw) return;

    const stored = JSON.parse(raw) as StoredPendingVerificationState | null;
    if (!stored?.email) return;

    pendingVerificationEmail.set(stored.email);

    if (stored.cooldownUntil && stored.cooldownUntil > Date.now()) {
      const secondsRemaining = Math.max(
        0,
        Math.ceil((stored.cooldownUntil - Date.now()) / 1000)
      );
      if (secondsRemaining > 0) {
        startResendCooldown(secondsRemaining);
      }
    }
  } catch {
    persistPendingVerificationState(null);
  }
}

function setPendingVerification(email: string, cooldownSeconds = 0, persist = true) {
  pendingVerificationEmail.set(email);

  if (persist) {
    const cooldownUntil = cooldownSeconds > 0 ? Date.now() + cooldownSeconds * 1000 : null;
    persistPendingVerificationState({ email, cooldownUntil });
  }

  startResendCooldown(cooldownSeconds);
}

function clearPersistedPendingVerification() {
  persistPendingVerificationState(null);
}

restorePendingVerificationState();

export function clearPendingVerificationState() {
  pendingVerificationEmail.set(null);
  resendCooldown.set(0);
  clearCooldownTimer();
  clearPersistedPendingVerification();
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
      setPendingVerification(email, 0);
    }
    throw error;
  }
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  authError.set(null);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTarget
      ? {
          emailRedirectTo: emailRedirectTarget,
        }
      : undefined,
  });

  const user = data?.user ?? null;

  if (!error) {
    const identities = user?.identities ?? [];

    if (identities.length === 0) {
      clearPendingVerificationState();
      const message = 'This email address is already registered. Please sign in instead.';
      return { status: 'already-exists', message };
    }

    setPendingVerification(email, RESEND_COOLDOWN_SECONDS);
    return { status: 'created', email };
  }

  const normalized = error.message.toLowerCase();
  const isAlreadyRegistered = /(already\s+registered|already\s+exists)/.test(normalized);

  if (isAlreadyRegistered) {
    // Ensure the user can immediately request a resend even if the next step fails.
    setPendingVerification(email, 0);

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: emailRedirectTarget
        ? {
            emailRedirectTo: emailRedirectTarget,
          }
        : undefined,
    });

    if (!resendError) {
      authError.set(null);
      setPendingVerification(email, RESEND_COOLDOWN_SECONDS);
      return { status: 'resent', email };
    }

    const resendMessage = resendError.message ?? 'Unable to resend verification email.';
    const normalizedResendMessage = resendMessage.toLowerCase();

    if (/already\s+(confirmed|verified)/.test(normalizedResendMessage)) {
      clearPendingVerificationState();
      const message = 'This email address is already verified. Please sign in instead.';
      authError.set(message);
      return { status: 'already-confirmed', message };
    }

    if (/rate|attempts|limit/.test(normalizedResendMessage)) {
      const message =
        'We recently sent a verification email. Please wait a moment before requesting another one.';
      authError.set(message);
      // Use a slightly longer cooldown when Supabase rate limits us.
      setPendingVerification(email, RESEND_COOLDOWN_SECONDS * 2);
      return { status: 'resend-rate-limited', message };
    }

    authError.set(resendMessage);
    return { status: 'resend-error', message: resendMessage };
  }

  authError.set(error.message);
  throw error;
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
    const normalized = error.message.toLowerCase();

    if (/already\s+(confirmed|verified)/.test(normalized)) {
      clearPendingVerificationState();
      const message = 'This email address has already been verified. You can sign in now.';
      authError.set(message);
      throw new Error(message);
    }

    if (/rate|attempts|limit/.test(normalized)) {
      const message =
        'You have requested too many emails in a short period. Please wait a minute before trying again.';
      authError.set(message);
      setPendingVerification(email, RESEND_COOLDOWN_SECONDS * 2);
      throw new Error(message);
    }

    authError.set(error.message);
    throw error;
  }

  setPendingVerification(email, RESEND_COOLDOWN_SECONDS);
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
