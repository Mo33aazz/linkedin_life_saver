<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { logs } from '../store';
  import type { LogLevel } from '../../shared/types';

  // Icons to match other sections
  import {
    ScrollText,
    Trash2,
    ChevronDown,
    ChevronRight,
    Search as SearchIcon,
    Info,
    AlertTriangle,
    Bug,
    XCircle
  } from 'lucide-svelte';

  let logsContainer: HTMLElement;
  let logEntries: HTMLElement[] = [];
  let isExpanded = false;
  let selectedLevel: LogLevel | 'ALL' = 'ALL';
  let searchTerm = '';

  // Log level configuration with colors + lucide icons
  const logLevelConfig: Record<LogLevel, { textColor: string; badgeBg: string; badgeBorder: string; Icon: any }> = {
    DEBUG: { textColor: 'text-gray-700', badgeBg: 'bg-gray-50', badgeBorder: 'border-gray-200', Icon: Bug },
    INFO: { textColor: 'text-blue-700', badgeBg: 'bg-blue-50', badgeBorder: 'border-blue-200', Icon: Info },
    WARN: { textColor: 'text-amber-700', badgeBg: 'bg-amber-50', badgeBorder: 'border-amber-200', Icon: AlertTriangle },
    ERROR: { textColor: 'text-red-700', badgeBg: 'bg-red-50', badgeBorder: 'border-red-200', Icon: XCircle }
  };

  // Filter logs based on level and search term. Show newest first.
  $: filteredLogs = $logs
    .filter((log) => {
      const levelMatch = selectedLevel === 'ALL' || log.level === selectedLevel;
      const s = searchTerm.trim().toLowerCase();
      const searchMatch =
        s === '' ||
        log.message.toLowerCase().includes(s) ||
        (log.context && JSON.stringify(log.context).toLowerCase().includes(s));
      return levelMatch && searchMatch;
    })
    .slice(-50) // Take latest 50
    .reverse(); // Newest at the top

  // Get log count by level
  $: logCounts = {
    ALL: $logs.length,
    DEBUG: $logs.filter((log) => log.level === 'DEBUG').length,
    INFO: $logs.filter((log) => log.level === 'INFO').length,
    WARN: $logs.filter((log) => log.level === 'WARN').length,
    ERROR: $logs.filter((log) => log.level === 'ERROR').length
  } as const;

  onMount(() => {
    // Initial animation
    gsap.fromTo(
      logsContainer,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }
    );
  });

  function toggleExpanded() {
    isExpanded = !isExpanded;
    const content = logsContainer.querySelector('.logs-content') as HTMLElement | null;
    if (!content) return;
    // Animate expansion height for a smoother feel
    if (isExpanded) {
      gsap.to(content, { maxHeight: 384, duration: 0.3, ease: 'power2.out' }); // 96 * 4
    } else {
      gsap.to(content, { maxHeight: 128, duration: 0.3, ease: 'power2.out' }); // 32 * 4
    }
  }

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function clearLogs() {
    // Animate log removal
    gsap.to(logEntries.filter(Boolean), {
      opacity: 0,
      x: -12,
      duration: 0.2,
      stagger: 0.04,
      onComplete: () => {
        // Clear logs from store
        import('../store').then(({ uiStore }) => {
          uiStore.clearLogs();
        });
      }
    });
  }

  // Animate new log entries (animate top entries since newest are first)
  $: if (filteredLogs.length > 0) {
    setTimeout(() => {
      const newEntries = logEntries.filter(Boolean).slice(0, 3);
      gsap.fromTo(
        newEntries,
        { opacity: 0, x: 12, scale: 0.98 },
        {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: 0.28,
          ease: 'power2.out',
          stagger: 0.08
        }
      );
    }, 100);
  }
</script>

<div bind:this={logsContainer} class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2 min-w-0">
      <ScrollText class="h-5 w-5 text-blue-600" aria-hidden="true" />
      <h2 class="text-sm font-semibold text-gray-900 truncate">Logs</h2>
      <span class="ml-1 text-xs font-medium text-gray-600">({logCounts.ALL})</span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Clear Logs Button (icon only) -->
      <button
        class="inline-flex items-center text-sm text-gray-700 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 border border-transparent hover:border-red-200"
        on:click={clearLogs}
        aria-label="Clear logs"
        title="Clear logs"
      >
        <Trash2 size={16} />
      </button>

      <!-- Expand/Collapse Button (icons only) -->
      <button
        class="inline-flex items-center text-sm text-gray-700 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
        on:click={toggleExpanded}
        aria-label={isExpanded ? 'Collapse logs' : 'Expand logs'}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Collapse logs' : 'Expand logs'}
      >
        {#if isExpanded}
          <ChevronDown size={18} />
        {:else}
          <ChevronRight size={18} />
        {/if}
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2 mb-3">
    <!-- Level Filter -->
    <div class="flex items-center gap-1">
      {#each ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as level}
        <button
          class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border transition-colors {selectedLevel === level ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}"
          on:click={() => (selectedLevel = level)}
          aria-label={`Filter by ${level}`}
        >
          {level}
          {#if logCounts[level] > 0}
            <span class="ml-0.5 opacity-75">({logCounts[level]})</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Search -->
  <div class="mb-3">
    <div class="relative">
      <label for="logs-search" class="sr-only">Search logs</label>
      <input
        id="logs-search"
        type="text"
        placeholder="Search logs..."
        bind:value={searchTerm}
        class="h-8 text-sm w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1 pl-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <SearchIcon class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
    </div>
  </div>

  <!-- Logs Content -->
  <div class="logs-content overflow-y-auto transition-all duration-300 {isExpanded ? 'max-h-96' : 'max-h-32'}">
    {#if filteredLogs.length === 0}
      <div class="text-center py-8 text-gray-600">
        <div class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium">
          <ScrollText class="h-4 w-4 text-gray-500" />
          {$logs.length === 0 ? 'No logs yet' : 'No logs match your filters'}
        </div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each filteredLogs as log, index}
          <div
            bind:this={logEntries[index]}
            class="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition-all duration-200"
          >
            <!-- Level Badge -->
            <div class="flex-shrink-0 mt-0.5">
              <span class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${logLevelConfig[log.level].badgeBg} ${logLevelConfig[log.level].badgeBorder} ${logLevelConfig[log.level].textColor}`}>
                <svelte:component this={logLevelConfig[log.level].Icon} size={14} />
                {log.level}
              </span>
            </div>

            <!-- Log Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class={`text-xs font-medium uppercase tracking-wide ${logLevelConfig[log.level].textColor}`}>
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>

              <p class="text-sm text-gray-900 leading-relaxed">
                {log.message}
              </p>

              {#if log.context && Object.keys(log.context).length > 0}
                <details class="mt-2">
                  <summary class="text-xs text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">Context</summary>
                  <pre class="mt-1 text-xs text-gray-800 bg-gray-50 p-2 rounded border overflow-x-auto">{JSON.stringify(log.context, null, 2)}</pre>
                </details>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .logs-content {
    scrollbar-width: thin;
    scrollbar-color: #e5e7eb #f9fafb;
  }

  .logs-content::-webkit-scrollbar {
    width: 6px;
  }

  .logs-content::-webkit-scrollbar-track {
    background: #f9fafb;
    border-radius: 3px;
  }

  .logs-content::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 3px;
  }

  .logs-content::-webkit-scrollbar-thumb:hover {
    background: #d1d5db;
  }

  .filter-button:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 1px;
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .transition-all,
    .transition-colors,
    .transition-transform {
      transition: none !important;
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 640px) {
    .flex.flex-wrap {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }
    
    .logs-content {
      max-height: 24rem !important;
    }
  }
  
  @media (max-width: 480px) {
    .text-sm {
      font-size: 0.75rem;
    }
    
    .text-xs {
      font-size: 0.625rem;
    }
  }
  
  /* Touch targets for mobile */
  @media (max-width: 768px) {
    button {
      min-height: 44px;
    }
    
    input[type="text"] {
      min-height: 44px;
      font-size: 16px; /* Prevent zoom on iOS */
    }
  }
</style>
