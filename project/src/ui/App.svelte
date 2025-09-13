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
  <div class="ui-scale">
  <!-- Header with animated title -->
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-white mb-1 animate-slide-up flex items-center gap-3" style="font-family: 'Saira', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
      <img src={chrome?.runtime?.getURL('logo.svg') || '/logo.svg'} alt="LinkedIn Life Saver Logo" class="w-8 h-8" />
      LinkedIn Life Saver
    </h1>
    <p class="text-sm text-gray-500 mb-2 font-medium">
      v.1.0
    </p>
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
</div>

<style>
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
</style>
