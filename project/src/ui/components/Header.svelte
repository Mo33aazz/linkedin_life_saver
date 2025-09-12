<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { pipelineStatus } from '../store';
  import type { RunState } from '../../shared/types';

  let statusIndicator: HTMLElement;
  let statusText: HTMLElement;

  // Status configuration with vibrant colors
  const statusConfig: Record<RunState, { color: string; bgColor: string; text: string; pulse: boolean }> = {
    idle: { color: 'text-gray-600', bgColor: 'bg-gray-200', text: 'Ready', pulse: false },
    running: { color: 'text-emerald-600', bgColor: 'bg-emerald-200', text: 'Running', pulse: true },
    paused: { color: 'text-amber-600', bgColor: 'bg-amber-200', text: 'Paused', pulse: false },
    error: { color: 'text-red-600', bgColor: 'bg-red-200', text: 'Error', pulse: true }
  };

  $: currentStatus = statusConfig[$pipelineStatus];

  onMount(() => {
    // Initial animation
    gsap.fromTo([statusIndicator, statusText], 
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.1 }
    );
  });

  // Reactive animation for status changes
  $: if (statusIndicator && statusText) {
    gsap.to([statusIndicator, statusText], {
      scale: 1.1,
      duration: 0.2,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1
    });
  }
</script>

<div class="header-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 animate-slide-up">
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <!-- Status Indicator -->
      <div 
        bind:this={statusIndicator}
        class="status-indicator relative flex items-center justify-center w-4 h-4 rounded-full transition-all duration-300 {currentStatus.bgColor}"
        class:animate-pulse={currentStatus.pulse}
      >
        <div class="w-2 h-2 rounded-full bg-current {currentStatus.color} opacity-80"></div>
        {#if currentStatus.pulse}
          <div class="absolute inset-0 rounded-full {currentStatus.bgColor} animate-ping opacity-30"></div>
        {/if}
      </div>
      
      <!-- Status Text -->
      <div bind:this={statusText} class="status-text">
        <span class="text-sm font-semibold {currentStatus.color} transition-colors duration-300">
          Pipeline Status
        </span>
        <div class="text-xs text-gray-500 mt-0.5">
          {currentStatus.text}
        </div>
      </div>
    </div>

    <!-- Action Indicator -->
    <div class="flex items-center space-x-2">
      {#if $pipelineStatus === 'running'}
        <div class="flex space-x-1">
          <div class="w-1 h-4 bg-primary-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-1 h-4 bg-secondary-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-1 h-4 bg-accent-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      {:else if $pipelineStatus === 'error'}
        <div class="text-red-500 animate-pulse">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
      {:else if $pipelineStatus === 'paused'}
        <div class="text-amber-500">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
      {:else}
        <div class="text-gray-400">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
        </div>
      {/if}
    </div>
  </div>

  <!-- Progress Bar for Running State -->
  {#if $pipelineStatus === 'running'}
    <div class="mt-3 bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div class="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full animate-progress-bar"></div>
    </div>
  {/if}
</div>

<style>
  .header-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(229, 231, 235, 0.8);
  }

  .status-indicator {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
  }

  @keyframes progress-bar {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .animate-progress-bar {
    animation: progress-bar 2s ease-in-out infinite;
  }

  /* Hover effects */
  .header-container:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .animate-pulse,
    .animate-bounce,
    .animate-progress-bar {
      animation: none;
    }
    
    .header-container:hover {
      transform: none;
    }
  }
</style>