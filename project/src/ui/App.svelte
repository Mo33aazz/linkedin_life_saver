<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gsap } from 'gsap';
  import Counters from './components/Counters.svelte';
  import PipelineProgress from './components/PipelineProgress.svelte';
  import Controls from './components/Controls.svelte';
  import LogsPanel from './components/LogsPanel.svelte';
  import AiSettings from './components/AiSettings.svelte';
  import { uiStore, pipelineStatus } from './store';
  import SidebarNav from './components/SidebarNav.svelte';
  import type { ExtensionMessage, UIState, LogEntry } from '../shared/types';
  import { getById, query } from './utils/domQuery';
  import AuthWelcome from './components/AuthWelcome.svelte';
  import {
    authStatus,
    authError,
    initializeAuth,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    teardownAuth,
    pendingVerificationEmail,
    resendVerificationEmail,
    resendCooldown,
    clearPendingVerificationState,
  } from './store/auth';

  let appContainer: HTMLElement;
  let activeSection: string | null = null;
  let observer: IntersectionObserver | null = null;
  const sectionIds = ['counters', 'pipeline', 'controls', 'ai-settings', 'logs'];
  let authLoading = false;
  let resendLoading = false;
  let authMessage: string | null = null;
  let hasAnimatedDashboard = false;
  let lastPendingEmail: string | null = null;

  // Computed styles for status chip in the header
  $: statusChip = (() => {
    switch ($pipelineStatus) {
      case 'running':
        return {
          classes: 'from-emerald-500/15 to-emerald-500/5 border-emerald-200 text-emerald-700',
          dot: 'bg-emerald-500'
        };
      case 'paused':
        return {
          classes: 'from-amber-500/15 to-amber-500/5 border-amber-200 text-amber-700',
          dot: 'bg-amber-500'
        };
      case 'error':
        return {
          classes: 'from-red-500/15 to-red-500/5 border-red-200 text-red-700',
          dot: 'bg-red-500'
        };
      default:
        return {
          classes: 'from-gray-400/15 to-gray-400/5 border-gray-200 text-gray-700',
          dot: 'bg-gray-400'
        };
    }
  })();

  $: if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle(
      'lea-bot-running',
      $pipelineStatus === 'running'
    );
  }

  $: if ($authStatus === 'authenticated') {
    authMessage = null;
    clearPendingVerificationState();
  }

  $: if ($authStatus !== 'authenticated') {
    hasAnimatedDashboard = false;
  }

  $: if ($authStatus === 'authenticated' && appContainer && !hasAnimatedDashboard) {
    gsap.fromTo(
      appContainer,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
    hasAnimatedDashboard = true;
  }

  function scrollToSection(id: string) {
    console.log('App: scrollToSection called with id:', id);
    // Query within our shadow root (not the page document)
    const el = (appContainer && getById<HTMLElement>(appContainer, id))
      || (appContainer && query<HTMLElement>(appContainer, `#${CSS.escape(id)}`));
    if (el) {
      console.log('App: Found element for section:', id, el);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      activeSection = id;
      console.log('App: Set activeSection to:', activeSection);
    } else {
      console.warn('App: Could not find element with id inside shadow root:', id);
    }
  }
  $: if ($authError && /invalid or has expired/i.test($authError)) {
    authMessage = 'Your verification link has expired. Request a fresh email below.';
  }

  $: if ($authError && /email not confirmed/i.test($authError)) {
    authMessage = 'Please verify your email to finish setting up your account. You can resend the link below.';
  }

  $: if ($pendingVerificationEmail !== lastPendingEmail) {
    lastPendingEmail = $pendingVerificationEmail;
    if (lastPendingEmail) {
      authMessage = `We just sent a verification email to ${lastPendingEmail}. Check your inbox, then sign in here once confirmed.`;
    }
  }

  async function handleAuthenticate(event: CustomEvent<{
    mode: 'sign-in' | 'sign-up';
    email: string;
    password: string;
  }>) {
    authLoading = true;
    authMessage = null;
    try {
      if (event.detail.mode === 'sign-in') {
        await signInWithPassword(event.detail.email, event.detail.password);
      } else {
        await signUpWithPassword(event.detail.email, event.detail.password);
        authMessage = `Almost there! Confirm the verification email sent to ${event.detail.email}, then sign in.`;
      }
    } catch (error) {
      console.error('Authentication failed', error);
      if (error instanceof Error && /not confirmed/i.test(error.message)) {
        authMessage =
          'Your account is awaiting verification. Please check your inbox or resend the verification email below.';
      }
    } finally {
      authLoading = false;
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      authMessage = 'You have been signed out.';
    } catch (error) {
      console.error('Failed to sign out', error);
    }
  }

  async function handleResendVerification() {
    if (!$pendingVerificationEmail || resendLoading) return;

    resendLoading = true;
    try {
      await resendVerificationEmail();
      authMessage = `A fresh verification email is on its way to ${$pendingVerificationEmail}.`;
    } catch (error) {
      console.error('Failed to resend verification email', error);
      if (error instanceof Error && !/supabase is not configured/i.test(error.message)) {
        authMessage = null;
      }
    } finally {
      resendLoading = false;
    }
  }
  let messageListener: (message: ExtensionMessage) => void;

  onMount(() => {
    console.log('UI App component mounted. Sending ping to service worker.');

    initializeAuth().catch((error) => {
      console.error('Unable to initialise Supabase authentication', error);
    });

    // Initialize GSAP animations when the dashboard renders
    if (appContainer) {
      gsap.fromTo(
        appContainer,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      );
    }

    // Send ping to service worker
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('Received response from service worker:', response);
        }
      });
    }

    // Set up message listener
    messageListener = (message: ExtensionMessage) => {
      console.log('UI received message:', message);
      if (message.type === 'STATE_UPDATE' && message.payload) {
        uiStore.updateState(message.payload as Partial<UIState>);
        return;
      } else if (message.type === 'LOG_ENTRY' && message.payload) {
        uiStore.addLog(message.payload as LogEntry);
        return;
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    // Observe sections to highlight active nav item
    // Observe sections relative to the sidebar scroll container
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        if (visible[0]?.target?.id) {
          activeSection = visible[0].target.id;
        }
      },
      {
        root: appContainer, // track visibility inside the sidebar, not the page viewport
        rootMargin: '0px 0px -60% 0px',
        threshold: [0.25, 0.5, 0.75],
      }
    );

    // Query sections from shadow root
    sectionIds.forEach((id) => {
      const el = (appContainer && getById<HTMLElement>(appContainer, id))
        || (appContainer && query<HTMLElement>(appContainer, `#${CSS.escape(id)}`));
      if (el) observer?.observe(el as Element);
    });
  });

  onDestroy(() => {
    teardownAuth();
    if (messageListener && typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.removeListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('lea-bot-running');
    }
  });
</script>

{#if $authStatus === 'authenticated'}
<div bind:this={appContainer} id="sidebar-app" class="sidebar animate-fade-in">
  <div class="ui-scale">
      <!-- Header with animated title, refactored to use same card style -->
      <div class="header-section">
        <div class="header-card relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 mb-4 shadow-sm animate-slide-up">
          <!-- subtle gradients inspired by geometric hero (no heavy motion) -->
          <div class="pointer-events-none absolute -top-16 -left-20 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-500/10 to-rose-400/10 blur-2xl"></div>
          <div class="pointer-events-none absolute -bottom-16 -right-20 h-40 w-40 rounded-full bg-gradient-to-tr from-violet-500/10 to-cyan-400/10 blur-2xl"></div>

          <div class="relative flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium bg-gradient-to-r {statusChip.classes}">
                <span class="inline-block h-2 w-2 rounded-full {statusChip.dot}"></span>
                <span>{$pipelineStatus.charAt(0).toUpperCase() + $pipelineStatus.slice(1)}</span>
              </div>

              <h1 class="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-gray-900 to-gray-700" style="font-family: 'Saira', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
                <span class="inline-flex items-center gap-2 align-middle">
                  <!-- LinkedIn logo to the left of the title -->
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 24 24"
                    class="h-7 w-7 shrink-0"
                  >
                    <rect x="0" y="0" width="24" height="24" rx="4" fill="#0A66C2" />
                    <text
                      x="12"
                      y="16"
                      text-anchor="middle"
                      font-size="12"
                      font-weight="700"
                      font-family="Inter, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
                      fill="#FFFFFF"
                    >in</text>
                  </svg>
                  <span>LinkedIn Life Saver</span>
                </span>
              </h1>
              <p class="mt-1 text-sm text-gray-600 leading-relaxed">Smart LinkedIn automation and insight tools — neatly organized in your sidebar.</p>
            </div>

            <img
              src={chrome?.runtime?.getURL('logo.svg') || '/logo.svg'}
              alt="LinkedIn Life Saver"
              class="h-8 w-8 shrink-0 opacity-90 invert"
            />
          </div>
        </div>
      </div>

    <!-- Main layout with navigation on the right -->
    <div class="main-layout">
      <!-- Main content sections -->
      <main class="content-area">
        <section id="counters" class="section-block">
          <Counters />
        </section>
        <section id="pipeline" class="section-block">
          <PipelineProgress />
        </section>
        <section id="controls" class="section-block">
          <Controls />
        </section>
        <section id="ai-settings" class="section-block">
          <AiSettings />
        </section>
        <section id="logs" class="section-block">
          <LogsPanel />
        </section>
      </main>
      
      <!-- Navigation positioned on the right side -->
      <aside class="nav-sidebar">
        <SidebarNav
          active={activeSection}
          on:navigate={(e) => scrollToSection(e.detail.id)}
          on:logout={handleSignOut}
        />
      </aside>
    </div>
  </div>
</div>
{:else if $authStatus === 'initializing'}
  <div class="auth-loading">
    <div class="auth-loading__card">
      <div class="auth-loading__spinner" aria-hidden="true"></div>
      <p>Preparing your workspace…</p>
    </div>
  </div>
{:else}
  <AuthWelcome
    error={$authError}
    message={authMessage}
    loading={authLoading}
    pendingEmail={$pendingVerificationEmail}
    resendCooldown={$resendCooldown}
    resendLoading={resendLoading}
    on:authenticate={handleAuthenticate}
    on:resendVerification={handleResendVerification}
  />
{/if}

<style>
  #sidebar-app {
    width: 100%;
    /* Keep container in sync with injected sidebar width */
    max-width: var(--sidebar-width, 420px);
    min-width: 280px;
    padding: 1.5rem;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .header-section {
    margin-bottom: 1.5rem;
  }

  .app-title {
    font-size: 1.875rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideUp 0.6s ease-out;
  }

  .logo {
    width: 2rem;
    height: 2rem;
  }

  /* removed version text + decorative progress to reduce noise */

  .section-block {
    scroll-margin-top: 16px;
  }

  .main-layout {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .nav-sidebar {
    position: sticky;
    top: 0.75rem;
    flex-shrink: 0;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounceGentle {
    0%, 100% {
      transform: scaleX(1);
    }
    50% {
      transform: scaleX(1.05);
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Disable zoom-based scaling; rely on base font-size scaling */
  .ui-scale {
    display: contents;
  }

  /* Responsive adjustments */
  @media (max-width: 480px) {
    #sidebar-app {
      padding: 1rem;
      min-width: 280px;
    }

    .app-title {
      font-size: 1.5rem;
    }

    .main-layout {
      flex-direction: column;
      gap: 0.75rem;
    }

    .content-area {
      gap: 0.75rem;
    }

    .nav-sidebar {
      position: static;
      order: 2;
      align-self: center;
    }
  }

  .auth-loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f1f5f9 0%, #e0e7ff 100%);
    padding: 2rem;
  }

  .auth-loading__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2.5rem;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 20px 45px -18px rgba(15, 23, 42, 0.25);
    text-align: center;
    color: #1f2937;
    font-weight: 500;
  }

  .auth-loading__spinner {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    border: 3px solid rgba(99, 102, 241, 0.2);
    border-top-color: #6366f1;
    animation: spin 0.9s linear infinite;
  }
</style>
