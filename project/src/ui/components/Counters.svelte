<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { stats, comments } from '../store';
  import type { Comment } from '../../shared/types';

  let counterElements: HTMLElement[] = [];
  
  // Calculate derived stats from comments
  $: derivedStats = {
    totalLikes: $comments.filter((c: Comment) => c.likeStatus === 'DONE').length,
    totalReplies: $comments.filter((c: Comment) => c.replyStatus === 'DONE').length,
    totalDMs: $comments.filter((c: Comment) => c.dmStatus === 'DONE').length,
    totalErrors: $comments.filter((c: Comment) => c.lastError).length,
    totalComments: $comments.length,
    pendingActions: $comments.filter((c: Comment) => 
      c.likeStatus === '' || c.replyStatus === '' || c.dmStatus === ''
    ).length
  };
  
  let previousStats = { ...derivedStats };

  // Counter configuration with vibrant colors
  const counterConfig: Array<{
    key: keyof typeof derivedStats;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    textColor: string;
  }> = [
    {
      key: 'totalLikes',
      label: 'Likes',
      icon: '👍',
      color: 'from-pink-500 to-rose-500',
      bgColor: 'bg-pink-50',
      textColor: 'text-pink-700'
    },
    {
      key: 'totalReplies', 
      label: 'Replies',
      icon: '💬',
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      key: 'totalDMs',
      label: 'DMs',
      icon: '📩',
      color: 'from-purple-500 to-violet-500', 
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700'
    },
    {
      key: 'totalComments',
      label: 'Comments',
      icon: '📝',
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'bg-emerald-50', 
      textColor: 'text-emerald-700'
    },
    {
      key: 'pendingActions',
      label: 'Pending',
      icon: '⏳',
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700'
    },
    {
      key: 'totalErrors',
      label: 'Errors', 
      icon: '⚠️',
      color: 'from-red-500 to-pink-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700'
    }
  ];

  onMount(() => {
    // Initial stagger animation
    gsap.fromTo(counterElements,
      { opacity: 0, y: 30, scale: 0.8 },
      { 
        opacity: 1, 
        y: 0, 
        scale: 1, 
        duration: 0.6, 
        ease: 'back.out(1.7)',
        stagger: 0.1 
      }
    );
  });

  // Animate counter changes
  function animateCounterChange(element: HTMLElement, newValue: number, oldValue: number) {
    if (newValue !== oldValue) {
      // Bounce animation for value change
      gsap.to(element, {
        scale: 1.2,
        duration: 0.2,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1
      });

      // Number counting animation
      const numberElement = element.querySelector('.counter-number');
      if (numberElement) {
        gsap.fromTo(numberElement, 
          { textContent: oldValue },
          {
            textContent: newValue,
            duration: 0.5,
            ease: 'power2.out',
            snap: { textContent: 1 }
          }
        );
      }
    }
  }

  // Watch for changes and animate
  $: {
    counterConfig.forEach((config, index) => {
      const currentValue = derivedStats[config.key];
      const previousValue = previousStats[config.key] || 0;
      
      if (counterElements[index] && currentValue !== previousValue) {
        animateCounterChange(counterElements[index], currentValue, previousValue);
      }
    });
    
    // Update previous stats
    previousStats = { ...derivedStats };
  }
</script>

<div class="counters-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
  <h2 class="font-semibold text-gray-900 mb-4 flex items-center">
    <span class="text-3xl mr-2">📊</span>
    Statistics
  </h2>
  
  <div class="grid grid-cols-2 gap-3">
    {#each counterConfig as config, index}
      <div 
        bind:this={counterElements[index]}
        class="counter-card {config.bgColor} rounded-lg p-3 border border-opacity-20 hover:shadow-md transition-all duration-300 cursor-pointer group"
        role="button"
        tabindex="0"
        aria-label="{config.label}: {derivedStats[config.key]}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-lg group-hover:scale-110 transition-transform duration-200">
              {config.icon}
            </span>
            <div>
              <div class="counter-number text-2xl font-bold {config.textColor}">
                {derivedStats[config.key]}
              </div>
              <div class="text-sm {config.textColor} opacity-90 font-medium">
                {config.label}
              </div>
            </div>
          </div>
          
          <!-- Gradient accent -->
          <div class="w-1 h-8 bg-gradient-to-b {config.color} rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-200"></div>
        </div>
        
        <!-- Progress indicator for pending actions -->
        {#if config.key === 'pendingActions' && derivedStats.pendingActions > 0}
          <div class="mt-2 bg-white bg-opacity-50 rounded-full h-1 overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r {config.color} rounded-full transition-all duration-500"
              style="width: {Math.min((derivedStats.pendingActions / Math.max(derivedStats.totalComments, 1)) * 100, 100)}%"
            ></div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
  
  <!-- Summary Stats -->
  <div class="mt-4 pt-4 border-t border-gray-100">
    <div class="flex justify-between items-center text-sm text-gray-600">
      <span>Top Level (No Replies): <strong class="text-gray-800">{$stats.totalTopLevelNoReplies}</strong></span>
      <span>User Comments: <strong class="text-gray-800">{$stats.userTopLevelNoReplies}</strong></span>
    </div>
  </div>
</div>

<style>
  .counter-card {
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 231, 235, 0.3);
  }

  .counter-card:hover {
    transform: translateY(-2px);
  }

  .counter-card:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .counter-card:hover {
      transform: none;
    }
    
    .group-hover\:scale-110 {
      transform: none !important;
    }
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    
    .counter-card {
      padding: 0.75rem;
    }
    
    .counter-number {
      font-size: 1.125rem;
    }
  }
  
  @media (max-width: 480px) {
    .grid {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    
    .counter-card {
      padding: 0.5rem;
    }
  }
  
  @media (max-width: 320px) {
    .grid {
      grid-template-columns: 1fr;
    }
    
    .counter-card {
      padding: 0.5rem;
      min-height: auto;
    }
  }
</style>
