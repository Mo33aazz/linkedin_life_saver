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

<div bind:this={appContainer} id="sidebar-app" class="sidebar p-6 animate-fade-in">
  <!-- Header with animated title -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent mb-2 animate-slide-up">
      LinkedIn Engagement Assistant
    </h1>
    <div class="h-1 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full w-full animate-bounce-gentle"></div>
  </div>

  <!-- Main content sections -->
  <div class="space-y-4">
    <Header />
    <Counters />
    <PipelineProgress />
    <Controls />
    <AiSettings />
    <LogsPanel />
  </div>
</div>

<style>
  :global(.sidebar) {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    z-index: 9999;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #e5e7eb #f9fafb;
  }

  :global(.sidebar::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.sidebar::-webkit-scrollbar-track) {
    background: #f9fafb;
  }

  :global(.sidebar::-webkit-scrollbar-thumb) {
    background: #e5e7eb;
    border-radius: 3px;
  }

  :global(.sidebar::-webkit-scrollbar-thumb:hover) {
    background: #d1d5db;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    :global(.sidebar) {
      width: 100vw;
      right: 0;
      padding: 1rem;
    }
    
    :global(.main-content) {
      padding: 0.75rem;
    }
  }
  
  @media (max-width: 480px) {
    :global(.sidebar) {
      padding: 0.75rem;
    }
    
    :global(.main-content) {
      padding: 0.5rem;
    }
  }
  
  @media (max-width: 360px) {
    :global(.sidebar) {
      width: 100vw;
      right: 0;
      padding: 0.5rem;
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
</style>