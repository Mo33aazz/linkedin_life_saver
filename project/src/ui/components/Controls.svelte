<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { pipelineStatus, postUrn, comments } from '../store';
  import type { ExtensionMessage, LogEntry } from '../../shared/types';
  import { getPostUrnFromUrl } from '../../shared/linkedin';
  import { Play, Pause, StopCircle, Download, FileText, RotateCcw, Settings, Clock, MessageCircle, AlertTriangle } from 'lucide-svelte';

  let controlsContainer: HTMLElement;
  let buttons: HTMLElement[] = [];

  // Local settings state (aligned with React example defaults)
  let maxComments = 100;
  let delayMin = 1000;
  let delayMax = 3000;

  // Modal state for reset
  let showResetDialog = false;

  // Derived UI helpers
  $: isActive = $pipelineStatus === 'running' || $pipelineStatus === 'paused';
  $: processedCount = ($comments || []).filter((c) =>
    c.replyStatus === 'DONE' || c.replyStatus === 'SKIPPED' || !!c.pipeline?.repliedAt
  ).length;
  $: progressPct = Math.min((processedCount / Math.max(1, Math.min(maxComments, ($comments || []).length || maxComments))) * 100, 100);

  // Helper: Get post URN from current tab URL as fallback
  const getPostUrnFromCurrentTab = (): string | null => {
    return getPostUrnFromUrl(window.location.href);
  };

  // Main button configuration based on status
  $: mainButton = (() => {
    switch ($pipelineStatus) {
      case 'running':
        return { id: 'pause', text: 'Pause Pipeline', icon: Pause, onClick: pausePipeline } as const;
      case 'paused':
        return { id: 'resume', text: 'Resume Pipeline', icon: Play, onClick: resumePipeline } as const;
      case 'idle':
      case 'error':
      default:
        return { id: 'start', text: 'Start Pipeline', icon: Play, onClick: startPipeline } as const;
    }
  })();

  onMount(() => {
    gsap.fromTo(
      controlsContainer,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
    );
  });

  // Pipeline control functions
  async function startPipeline() {
    const urn = $postUrn || getPostUrnFromCurrentTab() || undefined;
    await saveConfigBeforeStart();
    sendMessage({
      type: 'START_PIPELINE',
      payload: { postUrn: urn, maxComments, delayMin, delayMax },
    });
    animateButtonClick('start');
  }

  async function saveConfigBeforeStart() {
    if (typeof window === 'undefined' || !window.__LINKEDIN_SAVE_AI_CONFIG) {
      return;
    }

    try {
      await window.__LINKEDIN_SAVE_AI_CONFIG();
    } catch (error) {
      console.error('Failed to save AI settings before starting pipeline:', error);
    }
  }

  function pausePipeline() {
    // STOP in background maps to paused
    sendMessage({ type: 'STOP_PIPELINE' } as any);
    animateButtonClick('pause');
  }

  function resumePipeline() {
    sendMessage({ type: 'RESUME_PIPELINE', postUrn: $postUrn } as any);
    animateButtonClick('resume');
  }

  function stopPipeline() {
    // Reset to idle
    sendMessage({ type: 'RESET_PIPELINE', postUrn: $postUrn } as any);
    animateButtonClick('stop');
  }

  function handleExportJSON() {
    chrome.runtime.sendMessage({ type: 'EXPORT_JSON', postUrn: $postUrn }, (response) => {
      if (response?.data) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linkedin-post-${$postUrn || 'data'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  function handleExportLogs() {
    chrome.runtime.sendMessage({ type: 'EXPORT_LOGS' }, (response) => {
      if (response?.logs) {
        const blob = new Blob([
          response.logs.map((log: LogEntry) => `[${log.timestamp}] ${log.level}: ${log.message}`).join('\n'),
        ], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  function confirmReset() {
    showResetDialog = true;
  }

  function resetSession() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'RESET_SESSION', postUrn: $postUrn } as any);
    }
    showResetDialog = false;
  }

  function sendMessage(message: ExtensionMessage) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
        }
        return response;
      });
    }
  }

  function animateButtonClick(buttonId: string) {
    const button = buttons.find((btn) => btn?.id === buttonId);
    if (button) {
      gsap.to(button, { scale: 0.97, duration: 0.1, ease: 'power2.out', yoyo: true, repeat: 1 });
    }
  }

  // Update AI config for delays when they change
  $: if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'UPDATE_AI_CONFIG', payload: { minDelay: delayMin, maxDelay: delayMax } } as any);
  }
</script>

<div bind:this={controlsContainer} class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <Settings class="h-5 w-5 text-blue-600" aria-hidden="true" />
      <h2 class="font-semibold text-gray-900">Pipeline Settings</h2>
    </div>
    <div class="px-2 py-1 rounded-full text-xs font-medium border flex items-center gap-1"
      class:bg-green-50={$pipelineStatus === 'running'}
      class:text-green-700={$pipelineStatus === 'running'}
      class:bg-yellow-50={$pipelineStatus === 'paused'}
      class:text-yellow-700={$pipelineStatus === 'paused'}
      class:bg-gray-50={$pipelineStatus === 'idle'}
      class:text-gray-700={$pipelineStatus === 'idle'}
      class:bg-red-50={$pipelineStatus === 'error'}
      class:text-red-700={$pipelineStatus === 'error'}
    >
      <span class="inline-block h-2 w-2 rounded-full"
        class:bg-green-500={$pipelineStatus === 'running'}
        class:bg-yellow-500={$pipelineStatus === 'paused'}
        class:bg-gray-400={$pipelineStatus === 'idle'}
        class:bg-red-500={$pipelineStatus === 'error'}
      ></span>
      {$pipelineStatus.toUpperCase()}
    </div>
  </div>

  <!-- Progress -->
  {#if isActive}
    <div class="space-y-2 mb-3">
      <div class="flex justify-between text-sm text-gray-600">
        <span>Progress</span>
        <span>{processedCount} / {Math.min(maxComments, ($comments || []).length || maxComments)}</span>
      </div>
      <div class="w-full bg-gray-100 rounded-full h-2">
        <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style={`width: ${progressPct}%`}></div>
      </div>
    </div>
  {/if}

  <!-- Main Controls -->
  <div class="flex gap-2 mb-3">
    <button
      bind:this={buttons[0]}
      id={mainButton.id}
      class="flex-1 inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white shadow-sm transition-all bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      on:click={mainButton.onClick}
    >
      <svelte:component this={mainButton.icon} size={16} />
      {mainButton.text}
    </button>

    {#if isActive}
      <button
        bind:this={buttons[1]}
        id="stop"
        class="inline-flex items-center justify-center h-9 w-9 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        on:click={stopPipeline}
        aria-label="Stop Pipeline"
      >
        <StopCircle size={16} />
      </button>
    {/if}
  </div>

  <!-- Settings -->
  <div class="mb-3">
    <div class="flex items-center gap-2 text-sm font-medium text-gray-800 mb-2">
    </div>

    <div class="space-y-3">
      <div>
        <label for="maxComments" class="text-xs text-gray-600">Max Comments</label>
        <div class="flex items-center gap-2 mt-1">
          <MessageCircle size={14} class="text-gray-500" aria-hidden="true" />
          <input
            id="maxComments"
            type="number"
            min="1"
            max="1000"
            bind:value={maxComments}
            class="h-8 text-sm w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="minDelay" class="text-xs text-gray-600">Min Delay (ms)</label>
          <div class="flex items-center gap-1 mt-1">
            <Clock size={12} class="text-gray-500" aria-hidden="true" />
            <input
              id="minDelay"
              type="number"
              min="100"
              max="60000"
              step="100"
              bind:value={delayMin}
              class="h-8 text-sm w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label for="maxDelay" class="text-xs text-gray-600">Max Delay (ms)</label>
          <div class="flex items-center gap-1 mt-1">
            <Clock size={12} class="text-gray-500" aria-hidden="true" />
            <input
              id="maxDelay"
              type="number"
              min="100"
              max="60000"
              step="100"
              bind:value={delayMax}
              class="h-8 text-sm w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Secondary Actions -->
  <div class="space-y-2">
    <div class="grid grid-cols-2 gap-2">
      <button
        bind:this={buttons[2]}
        class="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border text-xs bg-white hover:bg-gray-50 text-gray-800 shadow-sm"
        on:click={handleExportJSON}
        data-testid="export-json-button"
      >
        <Download size={14} />
        Export Data
      </button>
      <button
        bind:this={buttons[3]}
        class="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border text-xs bg-white hover:bg-gray-50 text-gray-800 shadow-sm"
        on:click={handleExportLogs}
        data-testid="export-logs-button"
      >
        <FileText size={14} />
        Export Logs
      </button>
    </div>

    <button
      bind:this={buttons[4]}
      class="inline-flex items-center justify-center gap-2 h-8 px-3 w-full rounded-md border text-xs text-red-600 bg-white hover:bg-red-50 shadow-sm"
      on:click={confirmReset}
      data-testid="reset-session-button"
    >
      <RotateCcw size={14} />
      Reset Session
    </button>
  </div>

  

  {#if showResetDialog}
    <!-- Simple Dialog -->
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div
        class="absolute inset-0 bg-black/50"
        role="button"
        tabindex="0"
        on:click={() => (showResetDialog = false)}
        on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') showResetDialog = false; }}
      ></div>
      <div class="relative z-10 w-full max-w-sm rounded-lg border bg-white p-5 shadow-lg">
        <div class="mb-2">
          <h3 class="text-lg font-semibold">Reset Session</h3>
          <div class="reset-warning mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800" role="alert">
            <div class="flex items-start gap-2">
              <AlertTriangle class="h-5 w-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
              <p class="text-sm leading-5">
                This will clear all collected data and reset the pipeline for the current post. This action cannot be undone.
              </p>
            </div>
          </div>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          <button class="inline-flex items-center justify-center h-9 px-4 rounded-md border text-sm bg-white hover:bg-gray-50" on:click={() => (showResetDialog = false)}>Cancel</button>
          <button class="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm text-white bg-red-600 hover:bg-red-700" on:click={resetSession}>Reset Session</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
</style>
