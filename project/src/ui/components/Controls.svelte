<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { pipelineStatus, postUrn } from '../store';
  import type { ExtensionMessage, LogEntry } from '../../shared/types';

  let controlsContainer: HTMLElement;
  let buttons: HTMLElement[] = [];
  let isExporting = false;

  // Settings state variables (ported from Controls.tsx)
  let maxReplies = 10;
  let maxComments = 10;
  let delayMin = 2000;
  let delayMax = 5000;
  let maxOpenTabs = 3;
  let maxScrolls = 10;
  let rateProfile: 'normal' | 'conservative' | 'aggressive' = 'normal';

  // Helper function to get post URN from current tab
  const getPostUrnFromCurrentTab = (): string | null => {
    const postUrnRegex = /(urn:li:activity:\d+)/;
    const match = window.location.href.match(postUrnRegex);
    return match && match[1] ? match[1] : null;
  };

  // Single control button configuration based on pipeline status
  $: currentButton = (() => {
    switch ($pipelineStatus) {
      case 'running':
        return {
          id: 'pause',
          label: 'Pause',
          icon: '⏸️',
          color: 'from-amber-500 to-orange-500',
          hoverColor: 'hover:from-amber-600 hover:to-orange-600',
          textColor: 'text-white',
          action: pausePipeline,
          disabled: false
        };
      case 'paused':
        return {
          id: 'resume',
          label: 'Resume',
          icon: '▶️',
          color: 'from-blue-500 to-indigo-500',
          hoverColor: 'hover:from-blue-600 hover:to-indigo-600',
          textColor: 'text-white',
          action: resumePipeline,
          disabled: false
        };
      case 'idle':
      case 'error':
      default:
        return {
          id: 'start',
          label: 'Start Pipeline',
          icon: '▶️',
          color: 'from-emerald-500 to-teal-500',
          hoverColor: 'hover:from-emerald-600 hover:to-teal-600',
          textColor: 'text-white',
          action: startPipeline,
          disabled: false
        };
    }
  })();

  // Secondary action button for stop functionality
  $: showStopButton = $pipelineStatus === 'running' || $pipelineStatus === 'paused';

  onMount(() => {
    // Initial animation
    gsap.fromTo(controlsContainer,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );

    // Stagger animate buttons
    gsap.fromTo(buttons.filter(Boolean),
      { opacity: 0, scale: 0.8, y: 10 },
      { 
        opacity: 1, 
        scale: 1, 
        y: 0,
        duration: 0.4, 
        ease: 'back.out(1.7)',
        stagger: 0.1 
      }
    );
  });

  // Pipeline control functions
  function startPipeline() {
    const postUrn = getPostUrnFromCurrentTab();
    sendMessage({
      type: 'START_PIPELINE',
      payload: {
        postUrn: postUrn || undefined,
        maxReplies,
        maxComments,
      }
    });
    animateButtonClick('start');
  }

  function pausePipeline() {
    sendMessage({ 
      type: 'STOP_PIPELINE'
    } as any);
    animateButtonClick('pause');
  }

  function resumePipeline() {
    sendMessage({ 
      type: 'RESUME_PIPELINE'
    } as any);
    animateButtonClick('resume');
  }

  function stopPipeline() {
    sendMessage({ 
      type: 'RESET_PIPELINE'
    } as any);
    animateButtonClick('stop');
  }

  function handleExportJSON() {
    chrome.runtime.sendMessage(
      { type: 'EXPORT_JSON', postUrn: $postUrn },
      (response) => {
        if (response?.data) {
          const blob = new Blob([JSON.stringify(response.data, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `linkedin-post-${$postUrn}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    );
  }

  function handleExportLogs() {
    chrome.runtime.sendMessage(
      { type: 'EXPORT_LOGS' },
      (response) => {
        if (response?.logs) {
          const blob = new Blob(
            [response.logs.map((log: LogEntry) => JSON.stringify(log)).join('\n')],
            { type: 'application/x-ndjson' }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `linkedin-assistant-logs-${Date.now()}.ndjson`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    );
  }

  function handleResetSession() {
    if (confirm('Are you sure you want to reset the session? This will clear all progress.')) {
      chrome.runtime.sendMessage({
        type: 'RESET_SESSION',
        postUrn: $postUrn,
      });
    }
  }

  function sendMessage(message: ExtensionMessage) {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('Message sent successfully:', response);
      }
    });
  }

  function animateButtonClick(buttonId: string) {
    const button = buttons.find(btn => btn?.id === buttonId);
    if (button) {
      gsap.to(button, {
        scale: 0.95,
        duration: 0.1,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1
      });
    }
  }

  // Remove unused variables and functions
  // exportData and stopPipeline functions are kept for potential future use

  // Send settings updates to background when they change (ported from Controls.tsx)
  $: {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          maxReplies,
          maxComments,
          delayMin,
          delayMax,
          maxOpenTabs,
          maxScrolls,
          rateProfile,
        },
      });
    }
  }
</script>

<div bind:this={controlsContainer} class="controls-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
  <h2 class="font-semibold text-gray-900 mb-4 flex items-center">
    <span class="text-2xl mr-2">🎮</span>
    Pipeline Controls
  </h2>

  <!-- Main Control Button -->
  <div class="flex gap-3 mb-4">
    <!-- Primary Action Button -->
    <button
      bind:this={buttons[0]}
      id={currentButton.id}
      class="control-button relative overflow-hidden bg-gradient-to-r {currentButton.color} {currentButton.hoverColor} {currentButton.textColor} font-semibold py-3 px-4 rounded-lg shadow-md transition-all duration-300 transform hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex-1"
      disabled={currentButton.disabled}
      on:click={currentButton.action}
      aria-label={currentButton.label}
    >
      <div class="flex items-center justify-center space-x-2">
        <span class="text-xl">{currentButton.icon}</span>
        <span class="text-base font-medium">{currentButton.label}</span>
      </div>
      
      <!-- Ripple effect -->
      <div class="absolute inset-0 bg-white bg-opacity-20 transform scale-0 rounded-lg transition-transform duration-300 group-active:scale-100"></div>
    </button>

    <!-- Stop Button (when pipeline is running or paused) -->
    {#if showStopButton}
      <button
        bind:this={buttons[1]}
        id="stop"
        class="control-button relative overflow-hidden bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition-all duration-300 transform hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        on:click={stopPipeline}
        aria-label="Stop Pipeline"
      >
        <div class="flex items-center justify-center space-x-2">
          <span class="text-xl">⏹️</span>
          <span class="text-base font-medium">Stop</span>
        </div>
        
        <!-- Ripple effect -->
        <div class="absolute inset-0 bg-white bg-opacity-20 transform scale-0 rounded-lg transition-transform duration-300 group-active:scale-100"></div>
      </button>
    {/if}
  </div>

  <!-- Settings Section -->
  <div class="border-t border-gray-100 pt-4 mb-4">
    <h3 class="font-medium text-gray-900 mb-3 flex items-center">
      <span class="text-xl mr-2">⚙️</span>
      Pipeline Settings
    </h3>
    
    <div class="space-y-3">
      <!-- Max Replies -->
      <div class="control-group">
        <label for="max-replies" class="block text-sm font-medium text-gray-800 mb-1">Max Replies (session):</label>
        <input
          id="max-replies"
          type="number"
          min="1"
          max="100"
          bind:value={maxReplies}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
      </div>

      <!-- Max Comments -->
      <div class="control-group">
        <label for="max-comments" class="block text-sm font-medium text-gray-800 mb-1">Max Comments to Fetch:</label>
        <input
          id="max-comments"
          type="number"
          min="1"
          max="100"
          bind:value={maxComments}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
      </div>

      <!-- Delay Range -->
      <div class="control-group">
        <label class="block text-sm font-medium text-gray-800 mb-1">Delay Between Replies:</label>
        <div class="flex items-center space-x-2">
          <input
            type="number"
            min="1000"
            max="60000"
            step="1000"
            bind:value={delayMin}
            placeholder="Min (ms)"
            class="flex-1 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <span class="text-gray-700">-</span>
          <input
            type="number"
            min="1000"
            max="60000"
            step="1000"
            bind:value={delayMax}
            placeholder="Max (ms)"
            class="flex-1 px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
      </div>

      <!-- Max Open Tabs -->
      <div class="control-group">
        <label for="max-tabs" class="block text-sm font-medium text-gray-800 mb-1">Max Open Tabs:</label>
        <input
          id="max-tabs"
          type="number"
          min="1"
          max="10"
          bind:value={maxOpenTabs}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
      </div>

      <!-- Max Scrolls -->
      <div class="control-group">
        <label for="max-scrolls" class="block text-sm font-medium text-gray-800 mb-1">Max Scrolls:</label>
        <input
          id="max-scrolls"
          type="number"
          min="1"
          max="50"
          bind:value={maxScrolls}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
      </div>

      <!-- Rate Profile -->
      <div class="control-group">
        <label for="rate-profile" class="block text-sm font-medium text-gray-800 mb-1">Rate Limit Profile:</label>
        <select
          id="rate-profile"
          bind:value={rateProfile}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
        >
          <option value="normal">Normal</option>
          <option value="conservative">Conservative</option>
          <option value="aggressive">Aggressive</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Secondary Actions -->
  <div class="border-t border-gray-100 pt-4">
    <div class="grid grid-cols-1 gap-3">
      <!-- Export JSON Button -->
      <button
        bind:this={buttons[2]}
        class="control-button secondary-button bg-gradient-to-r from-green-100 to-emerald-100 hover:from-green-200 hover:to-emerald-200 text-green-700 font-medium py-2.5 px-4 rounded-lg border border-green-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        on:click={handleExportJSON}
        data-testid="export-json-button"
        aria-label="Export JSON data"
      >
        <div class="flex items-center justify-center space-x-2">
          <span class="text-xl">📄</span>
          <span class="text-base">Export JSON</span>
        </div>
      </button>

      <!-- Export Logs Button -->
      <button
        bind:this={buttons[3]}
        class="control-button secondary-button bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 text-blue-700 font-medium py-2.5 px-4 rounded-lg border border-blue-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        on:click={handleExportLogs}
        data-testid="export-logs-button"
        aria-label="Export logs"
      >
        <div class="flex items-center justify-center space-x-2">
          <span class="text-xl">📋</span>
          <span class="text-base">Export Logs</span>
        </div>
      </button>

      <!-- Reset Session Button -->
      <button
        bind:this={buttons[4]}
        class="control-button secondary-button bg-gradient-to-r from-red-100 to-pink-100 hover:from-red-200 hover:to-pink-200 text-red-700 font-medium py-2.5 px-4 rounded-lg border border-red-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        on:click={handleResetSession}
        data-testid="reset-session-button"
        aria-label="Reset session"
      >
        <div class="flex items-center justify-center space-x-2">
          <span class="text-xl">🔄</span>
          <span class="text-base">Reset Session</span>
        </div>
      </button>

      
    </div>
  </div>

  <!-- Status Indicator -->
  <div class="mt-4 flex items-center justify-center">
    <div class="flex items-center space-x-2 text-gray-700">
      <div class="w-2 h-2 rounded-full {$pipelineStatus === 'running' ? 'bg-emerald-500 animate-pulse' : $pipelineStatus === 'paused' ? 'bg-amber-500' : $pipelineStatus === 'error' ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}"></div>
      <h3 class="capitalize">{$pipelineStatus}</h3>
    </div>
  </div>
</div>

<style>
  .controls-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.95);
  }

  .control-button {
    position: relative;
    overflow: hidden;
  }

  .control-button:active {
    transform: scale(0.98);
  }

  .control-button:disabled {
    transform: none !important;
  }

  .secondary-button {
    backdrop-filter: blur(5px);
  }

  /* Ripple effect */
  .control-button:active .absolute {
    animation: ripple 0.6s ease-out;
  }

  @keyframes ripple {
    0% {
      transform: scale(0);
      opacity: 1;
    }
    100% {
      transform: scale(4);
      opacity: 0;
    }
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .control-button:hover {
      transform: none;
    }
    
    .animate-spin,
    .animate-pulse {
      animation: none;
    }
  }

  /* Focus styles for keyboard navigation */
  .control-button:focus-visible,
  .secondary-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
  
  /* Responsive adjustments */
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    
    .control-button {
      padding: 0.75rem 1rem;
    }
    
    .secondary-button {
      padding: 0.5rem 0.75rem;
    }
  }
  
  @media (max-width: 480px) {
    .controls-container {
      padding: 0.75rem;
    }
    
    .control-button {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }
    
    .secondary-button {
      padding: 0.5rem;
      font-size: 0.75rem;
    }
  }
  
  /* Touch targets for mobile */
  @media (max-width: 768px) {
    .control-button,
    .secondary-button {
      min-height: 44px; /* Minimum touch target size */
    }
  }
</style>
