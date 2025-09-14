<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gsap } from 'gsap';
  import Header from './components/Header.svelte';
  import Counters from './components/Counters.svelte';
  import PipelineProgress from './components/PipelineProgress.svelte';
  import Controls from './components/Controls.svelte';
  import LogsPanel from './components/LogsPanel.svelte';
  import AiSettings from './components/AiSettings.svelte';
  import { uiStore } from './store';
  import SidebarNav from './components/SidebarNav.svelte';
  import type { ExtensionMessage, UIState, LogEntry } from '../shared/types';

  let appContainer: HTMLElement;
  let activeSection: string | null = null;
  let observer: IntersectionObserver | null = null;
  const sectionIds = ['counters', 'pipeline', 'controls', 'ai-settings', 'logs'];

  function scrollToSection(id: string) {
    console.log('App: scrollToSection called with id:', id);
    // Query within our shadow root (not the page document)
    const root = (appContainer?.getRootNode?.() as ShadowRoot | null) ?? null;
    const el = (root && 'getElementById' in root ? root.getElementById(id) : null)
      || appContainer?.querySelector(`#${CSS.escape(id)}`);
    if (el instanceof HTMLElement) {
      console.log('App: Found element for section:', id, el);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      activeSection = id;
      console.log('App: Set activeSection to:', activeSection);
    } else {
      console.warn('App: Could not find element with id inside shadow root:', id);
    }
  }
  let messageListener: (message: ExtensionMessage) => void;

  onMount(() => {
    console.log('UI App component mounted. Sending ping to service worker.');
    
    // Initialize GSAP animations
    gsap.fromTo(appContainer, 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );

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
    const rootNode = (appContainer?.getRootNode?.() as ShadowRoot | null) ?? null;
    sectionIds.forEach((id) => {
      const el = (rootNode && 'getElementById' in rootNode ? rootNode.getElementById(id) : null)
        || appContainer?.querySelector(`#${CSS.escape(id)}`);
      if (el) observer?.observe(el);
    });
  });

  onDestroy(() => {
    if (messageListener && typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.removeListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });
</script>

<div bind:this={appContainer} id="sidebar-app" class="sidebar animate-fade-in">
  <div class="ui-scale">
      <!-- Header with animated title, refactored to use same card style -->
      <div class="header-section">
        <div class="header-card bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 animate-slide-up">
          <div class="flex items-center gap-3">
            <h1
              class="app-title"
              style="font-family: 'Saira', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;"
            >
              <img
                src={chrome?.runtime?.getURL('logo.svg') || '/logo.svg'}
                alt="LinkedIn Life Saver Logo"
                class="logo"
              />
              LinkedIn Life Saver
            </h1>
          </div>
          <p class="version-text">v1.0</p>
          <div class="progress-bar"></div>
        </div>
      </div>

    <!-- Main layout with navigation on the right -->
    <div class="main-layout">
      <!-- Main content sections -->
      <main class="content-area">
        <Header />
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
        <SidebarNav active={activeSection} on:navigate={(e) => scrollToSection(e.detail.id)} />
      </aside>
    </div>
  </div>
</div>

<style>
  #sidebar-app {
    width: 100%;
    max-width: 520px;
    min-width: 320px;
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

  .version-text {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .progress-bar {
    height: 0.25rem;
    background: linear-gradient(to right, var(--primary-500), var(--secondary-500));
    border-radius: 9999px;
    width: 100%;
    animation: bounceGentle 2s ease-in-out infinite;
  }

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
</style>
