<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { pipelineStatus, postUrn } from '../store';
  import type { ExtensionMessage, LogEntry } from '../../shared/types';

  let controlsContainer: HTMLElement;
  let buttons: HTMLElement[] = [];

  // Settings state variables (simplified to essential parameters only)
  let maxComments = 10;
  let delayMin = 2000;
  let delayMax = 5000;

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
        maxComments,
        delayMin,
        delayMax,
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

  // Send settings updates to background when they change (simplified to essential parameters)
  $: {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          maxComments,
          delayMin,
          delayMax,
        },
      });
    }
  }
</script>

<div bind:this={controlsContainer} class="controls-container bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4 max-w-full overflow-hidden">
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
        class="control-button stop-button font-semibold py-3 px-4 rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex-1"
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
      <!-- Comments to Fetch -->
      <div class="control-group">
        <label for="max-comments" class="block text-sm font-medium text-gray-800 mb-1">Comments to Fetch:</label>
        <input
          id="max-comments"
          type="number"
          min="1"
          max="1000"
          bind:value={maxComments}
          class="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />
      </div>

      <!-- Delay Range -->
      <div class="control-group">
        <label class="block text-sm font-medium text-gray-800 mb-1">Delay Between Actions:</label>
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
    </div>
  </div>

  <!-- Secondary Actions -->
  <div class="border-t border-gray-100 pt-4">
    <div class="grid grid-cols-1 gap-3">
      <!-- Export JSON Button -->
      <button
        bind:this={buttons[2]}
        class="secondary-button export-json"
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
        class="secondary-button export-logs"
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
        class="secondary-button reset-session"
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
    backdrop-filter: blur(16px);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
    border: 1px solid rgba(226, 232, 240, 0.6);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .control-button {
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .control-button:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.1);
  }

  .control-button:active {
    transform: translateY(-1px) scale(0.99);
    transition-duration: 0.1s;
  }

  .control-button:disabled {
    transform: none !important;
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .stop-button {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .stop-button:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }

  .secondary-button {
    backdrop-filter: blur(8px);
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
    border: 1px solid rgba(203, 213, 225, 0.8) !important;
    color: #475569 !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .secondary-button:hover {
    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%) !important;
    transform: translateY(-1px) scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
  }

  .export-json {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #166534;
  }

  .export-json:hover {
    background: linear-gradient(135deg, #d1fae5 0%, #bbf7d0 100%);
  }

  .export-logs {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #1e40af;
  }

  .export-logs:hover {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  }

  .reset-session {
    background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #991b1b;
  }

  .reset-session:hover {
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
  }

  /* Enhanced Input Styling */
  .control-group {
    @apply mb-4;
  }

  .control-group label {
    @apply block text-sm font-semibold text-gray-800 mb-2;
    background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .control-group input {
    @apply w-full px-4 py-2.5 rounded-lg border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-1;
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid rgba(203, 213, 225, 0.8);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .control-group input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(0, 0, 0, 0.1);
    background: #ffffff;
  }

  .range-inputs {
    @apply flex items-center space-x-3;
  }

  .range-inputs span {
    @apply text-gray-500 font-medium;
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

  /* Enhanced Status Indicator */
  .status-indicator {
    @apply flex items-center space-x-3 p-4 rounded-xl;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid rgba(203, 213, 225, 0.6);
    backdrop-filter: blur(8px);
  }

  .status-dot {
    @apply w-3 h-3 rounded-full transition-all duration-300;
    box-shadow: 0 0 10px currentColor;
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .control-button:hover,
    .secondary-button:hover {
      transform: none;
    }
    
    .animate-spin,
    .animate-pulse {
      animation: none;
    }

    .status-dot {
      box-shadow: none;
    }
  }

  /* Focus styles for keyboard navigation */
  .control-button:focus-visible,
  .secondary-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .control-group input:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
  
  .controls-container {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .control-button {
    min-width: 0;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Enhanced Responsive Design */
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    
    .control-button {
      padding: 0.875rem 0.75rem;
      font-size: 0.9rem;
      min-width: 0;
    }
    
    .secondary-button {
      padding: 0.75rem 0.5rem;
      font-size: 0.85rem;
    }

    .range-inputs {
      @apply flex-col space-y-2 space-x-0;
    }

    .controls-container {
      padding: 0.75rem;
    }
  }
  
  @media (max-width: 480px) {
    .controls-container {
      padding: 1rem;
    }
    
    .control-button {
      padding: 0.75rem;
      font-size: 0.875rem;
    }
    
    .secondary-button {
      padding: 0.625rem;
      font-size: 0.8rem;
    }

    .control-group input {
      padding: 0.625rem 0.75rem;
      font-size: 0.875rem;
    }
  }
  
  /* Touch targets for mobile */
  @media (max-width: 768px) {
    .control-button,
    .secondary-button {
      min-height: 44px; /* Minimum touch target size */
    }

    .control-group input {
      min-height: 44px;
    }
  }
</style>
