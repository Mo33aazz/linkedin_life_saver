<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let error: string | null = null;
  export let message: string | null = null;
  export let loading = false;
  export let pendingEmail: string | null = null;
  export let resendCooldown = 0;
  export let resendLoading = false;

  const dispatch = createEventDispatcher<{
    authenticate: { mode: 'sign-in' | 'sign-up'; email: string; password: string };
    resendVerification: void;
  }>();

  let mode: 'sign-in' | 'sign-up' = 'sign-in';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let formError: string | null = null;

  $: formError = error;

  function switchMode() {
    mode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
    formError = null;
  }

  function validate(): boolean {
    if (!email.trim() || !password.trim()) {
      formError = 'Email and password are required.';
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      formError = 'Please enter a valid email address.';
      return false;
    }

    if (password.length < 6) {
      formError = 'Password must be at least 6 characters long.';
      return false;
    }

    if (mode === 'sign-up' && password !== confirmPassword) {
      formError = 'Passwords do not match.';
      return false;
    }

    formError = null;
    return true;
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validate()) return;
    dispatch('authenticate', { mode, email, password });
  }

  function requestResend() {
    dispatch('resendVerification');
  }
</script>

<section class="welcome">
  <div class="panel animate-slide-up">
    <div class="copy">
      <h1>Welcome back to LinkedIn Life Saver</h1>
      <p>
        Sign in to orchestrate your LinkedIn engagement pipeline. Track conversations, customise AI
        replies, and keep your momentum going.
      </p>
      <ul>
        <li>Personalised AI replies tuned for your voice</li>
        <li>Pipeline checkpoints with real-time progress</li>
        <li>Audit-ready activity logs and export tools</li>
      </ul>
    </div>
    <form class="auth-card" on:submit={handleSubmit} aria-busy={loading}>
      <h2>{mode === 'sign-in' ? 'Sign in to continue' : 'Create your account'}</h2>
      <label>
        <span>Email</span>
        <input
          type="email"
          name="email"
          bind:value={email}
          placeholder="you@email.com"
          autocomplete="email"
          required
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          name="password"
          bind:value={password}
          placeholder="••••••••"
          autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          minlength="6"
          required
        />
      </label>

      {#if mode === 'sign-up'}
        <label>
          <span>Confirm password</span>
          <input
            type="password"
            name="confirm-password"
            bind:value={confirmPassword}
            placeholder="Re-enter your password"
            autocomplete="new-password"
            minlength="6"
            required
          />
        </label>
      {/if}

      {#if message && !formError}
        <p class="info" role="status">{message}</p>
      {/if}

      {#if formError}
        <p class="error" role="alert">{formError}</p>
      {/if}

      {#if pendingEmail}
        <div class="verification-hint" aria-live="polite">
          <p>
            Didn't get the email? We can resend the verification link to
            <strong>{pendingEmail}</strong>.
          </p>
          <button
            type="button"
            class="link"
            on:click={requestResend}
            disabled={loading || resendLoading || resendCooldown > 0}
          >
            {#if resendLoading}
              Sending…
            {:else if resendCooldown > 0}
              Retry in {resendCooldown}s
            {:else}
              Resend verification email
            {/if}
          </button>
        </div>
      {/if}

      <button type="submit" class="primary" disabled={loading}>
        {#if loading}
          <span class="spinner" aria-hidden="true"></span>
          <span>{mode === 'sign-in' ? 'Signing in…' : 'Creating account…'}</span>
        {:else}
          <span>{mode === 'sign-in' ? 'Sign in' : 'Sign up'}</span>
        {/if}
      </button>

      <button type="button" class="secondary" on:click={switchMode} disabled={loading}>
        {mode === 'sign-in'
          ? "Don't have an account? Create one"
          : 'Already have an account? Sign in'}
      </button>
    </form>
  </div>
</section>

<style>
  .welcome {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: radial-gradient(circle at top left, #eef2ff, transparent 60%),
      radial-gradient(circle at bottom right, #fdf2f8, transparent 55%),
      linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  }

  .panel {
    display: grid;
    gap: 2.5rem;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    max-width: 960px;
    width: 100%;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 1.5rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.18);
    padding: 3rem;
    backdrop-filter: blur(22px);
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: #0f172a;
  }

  .copy h1 {
    font-size: clamp(2rem, 3vw, 2.75rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
  }

  .copy p {
    margin: 0;
    line-height: 1.6;
    color: #334155;
  }

  .copy ul {
    margin: 1rem 0 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 0.5rem;
    color: #1e293b;
  }

  .copy li {
    position: relative;
  }

  .copy li::marker {
    color: #6366f1;
  }

  .auth-card {
    background: white;
    border-radius: 1.25rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }

  .auth-card h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #0f172a;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: #1f2937;
  }

  input {
    padding: 0.75rem 1rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.45);
    background: rgba(255, 255, 255, 0.9);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
  }

  .error {
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #b91c1c;
    padding: 0.75rem 1rem;
    border-radius: 0.85rem;
    font-size: 0.9rem;
  }

  .info {
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.2);
    color: #047857;
    padding: 0.75rem 1rem;
    border-radius: 0.85rem;
    font-size: 0.9rem;
  }

  .verification-hint {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #334155;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.18);
    border-radius: 0.85rem;
    padding: 0.75rem 1rem;
  }

  .verification-hint strong {
    color: #1d4ed8;
    font-weight: 600;
  }

  .link {
    align-self: flex-start;
    background: transparent;
    border: none;
    color: #1d4ed8;
    font-weight: 600;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .link:hover:not([disabled]) {
    text-decoration: underline;
  }

  .link[disabled] {
    color: rgba(30, 64, 175, 0.6);
    cursor: progress;
  }

  .primary,
  .secondary {
    border-radius: 0.9rem;
    border: none;
    font-weight: 600;
    padding: 0.85rem 1rem;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    box-shadow: 0 18px 30px -15px rgba(79, 70, 229, 0.6);
  }

  .primary:hover:not([disabled]) {
    transform: translateY(-1px);
    box-shadow: 0 20px 35px -15px rgba(79, 70, 229, 0.7);
  }

  .secondary {
    background: rgba(99, 102, 241, 0.12);
    color: #4338ca;
  }

  .secondary:hover:not([disabled]) {
    background: rgba(99, 102, 241, 0.2);
  }

  [disabled] {
    opacity: 0.65;
    cursor: progress;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: white;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 720px) {
    .panel {
      padding: 2rem;
    }
  }
</style>
