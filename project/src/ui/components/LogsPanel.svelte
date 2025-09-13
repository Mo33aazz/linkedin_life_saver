<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { logs } from '../store';
  import type { LogEntry, LogLevel } from '../../shared/types';

  let logsContainer: HTMLElement;
  let logEntries: HTMLElement[] = [];
  let isExpanded = false;
  let selectedLevel: LogLevel | 'ALL' = 'ALL';
  let searchTerm = '';

  // Log level configuration with colors
  const logLevelConfig: Record<LogLevel, { color: string; bgColor: string; icon: string }> = {
    DEBUG: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: '🔍' },
    INFO: { color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'ℹ️' },
    WARN: { color: 'text-amber-600', bgColor: 'bg-amber-100', icon: '⚠️' },
    ERROR: { color: 'text-red-600', bgColor: 'bg-red-100', icon: '❌' }
  };

  // Filter logs based on level and search term
  $: filteredLogs = $logs.filter(log => {
    const levelMatch = selectedLevel === 'ALL' || log.level === selectedLevel;
    const searchMatch = searchTerm === '' || 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.context && JSON.stringify(log.context).toLowerCase().includes(searchTerm.toLowerCase()));
    return levelMatch && searchMatch;
  }).slice(-50); // Show only last 50 logs for performance

  // Get log count by level
  $: logCounts = {
    ALL: $logs.length,
    DEBUG: $logs.filter(log => log.level === 'DEBUG').length,
    INFO: $logs.filter(log => log.level === 'INFO').length,
    WARN: $logs.filter(log => log.level === 'WARN').length,
    ERROR: $logs.filter(log => log.level === 'ERROR').length
  };

  onMount(() => {
    // Initial animation
    gsap.fromTo(logsContainer,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
  });

  function toggleExpanded() {
    isExpanded = !isExpanded;
    
    // Animate expansion
    if (isExpanded) {
      gsap.to(logsContainer.querySelector('.logs-content'), {
        height: 'auto',
        duration: 0.4,
        ease: 'power2.out'
      });
    } else {
      gsap.to(logsContainer.querySelector('.logs-content'), {
        height: '120px',
        duration: 0.4,
        ease: 'power2.out'
      });
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
      x: -20,
      duration: 0.3,
      stagger: 0.05,
      onComplete: () => {
        // Clear logs from store
        import('../store').then(({ uiStore }) => {
          uiStore.clearLogs();
        });
      }
    });
  }

  // Animate new log entries
  $: if (filteredLogs.length > 0) {
    setTimeout(() => {
      const newEntries = logEntries.filter(Boolean).slice(-3); // Animate last 3 entries
      gsap.fromTo(newEntries,
        { opacity: 0, x: 20, scale: 0.95 },
        { 
          opacity: 1, 
          x: 0, 
          scale: 1,
          duration: 0.4, 
          ease: 'power2.out',
          stagger: 0.1 
        }
      );
    }, 100);
  }
</script>

<div bind:this={logsContainer} class="logs-container bg-white rounded-xl shadow-sm border border-gray-100 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <h2 class="font-semibold text-gray-900 flex items-center">
      <span class="text-3xl mr-2">📋</span>
      System Logs
      <span class="ml-2 text-base font-normal text-gray-700">({logCounts.ALL})</span>
    </h2>
    
    <div class="flex items-center space-x-2">
      <!-- Clear Logs Button -->
      <button
        class="text-gray-500 hover:text-red-600 p-1 rounded transition-colors duration-200"
        on:click={clearLogs}
        aria-label="Clear logs"
        title="Clear logs"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clip-rule="evenodd" />
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V7a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </button>
      
      <!-- Expand/Collapse Button -->
      <button
        class="text-gray-500 hover:text-blue-600 p-1 rounded transition-colors duration-200"
        on:click={toggleExpanded}
        aria-label={isExpanded ? 'Collapse logs' : 'Expand logs'}
        title={isExpanded ? 'Collapse logs' : 'Expand logs'}
      >
        <svg class="w-4 h-4 transform transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <!-- Level Filter -->
    <div class="flex items-center space-x-1">
      {#each ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as level}
        <button
          class="filter-button px-2 py-1 text-xs font-medium rounded-full transition-all duration-200 {selectedLevel === level ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
          on:click={() => selectedLevel = level}
          aria-label="Filter by {level}"
        >
          {level}
          {#if logCounts[level] > 0}
            <span class="ml-1 opacity-75">({logCounts[level]})</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Search -->
  <div class="mb-4">
    <div class="relative">
      <input
        type="text"
        placeholder="Search logs..."
        bind:value={searchTerm}
        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pl-8"
      />
      <svg class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
      </svg>
    </div>
  </div>

  <!-- Logs Content -->
  <div class="logs-content {isExpanded ? 'max-h-96' : 'max-h-32'} overflow-y-auto transition-all duration-300">
    {#if filteredLogs.length === 0}
      <div class="text-center py-8 text-gray-500">
        <div class="text-4xl mb-2">📝</div>
        <p class="text-sm">
          {$logs.length === 0 ? 'No logs yet' : 'No logs match your filters'}
        </p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each filteredLogs as log, index}
          <div 
            bind:this={logEntries[index]}
        class="log-entry flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors duration-200 {logLevelConfig[log.level].bgColor} bg-opacity-40"
          >
            <!-- Level Icon -->
            <div class="flex-shrink-0 mt-0.5">
              <span class="text-sm">{logLevelConfig[log.level].icon}</span>
            </div>
            
            <!-- Log Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2 mb-1">
                <span class="text-sm font-medium {logLevelConfig[log.level].color} uppercase tracking-wide">
                  {log.level}
                </span>
                <span class="text-sm text-gray-700">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
              
              <p class="text-base text-gray-900 leading-relaxed">
                {log.message}
              </p>
              
              {#if log.context && Object.keys(log.context).length > 0}
                <details class="mt-2">
                  <summary class="text-sm text-gray-700 cursor-pointer hover:text-gray-900 transition-colors duration-200">
                    Context
                  </summary>
                  <pre class="mt-1 text-sm text-gray-800 bg-gray-50 p-2 rounded border overflow-x-auto">{JSON.stringify(log.context, null, 2)}</pre>
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
  .logs-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.95);
  }

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

  .log-entry {
    backdrop-filter: blur(5px);
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
    .logs-container {
      padding: 0.75rem;
    }
    
    .flex.flex-wrap {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }
    
    .filter-button {
      padding: 0.5rem 0.75rem;
      min-height: 36px;
    }
    
    .logs-content {
      max-height: 24rem !important;
    }
  }
  
  @media (max-width: 480px) {
    .logs-container {
      padding: 0.5rem;
    }
    
    .log-entry {
      padding: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
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
