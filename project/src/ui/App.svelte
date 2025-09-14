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
  import type { ExtensionMessage, UIState, LogEntry } from '../shared/types';

  let appContainer: HTMLElement;
  let messageListener: (message: ExtensionMessage) => void;

  onMount(() => {
    console.log('UI App component mounted. Sending ping to service worker.');
    
    // Initialize GSAP animations
    gsap.fromTo(appContainer, 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );

    // Send ping to service worker
    chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Received response from service worker:', response);
      }
    });

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

    chrome.runtime.onMessage.addListener(messageListener);
  });

  onDestroy(() => {
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }
  });
</script>

<div bind:this={appContainer} id="sidebar-app" class="sidebar animate-fade-in">
  <div class="ui-scale">
  <!-- Header with animated title -->
  <div class="header-section">
    <h1 class="app-title" style="font-family: 'Saira', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
      <img src={chrome?.runtime?.getURL('logo.svg') || '/logo.svg'} alt="LinkedIn Life Saver Logo" class="logo" />
      LinkedIn Life Saver
    </h1>
    <p class="version-text">
      v.1.0
    </p>
    <div class="progress-bar"></div>
  </div>

  <!-- Main content sections -->
  <div class="content-sections">
    <Header />
    <Counters />
    <PipelineProgress />
    <Controls />
    <AiSettings />
    <LogsPanel />
  </div>
  </div>
</div>

<style>
  #sidebar-app {
    width: 100%;
    max-width: 420px;
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
    color: white;
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
    color: #9ca3af;
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

  .content-sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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

    .content-sections {
      gap: 0.75rem;
    }
  }
</style>
