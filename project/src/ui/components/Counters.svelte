<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { comments } from '../store';
  import type { Comment } from '../../shared/types';
  import { 
    Heart, 
    MessageCircle, 
    Mail, 
    Clock, 
    AlertCircle, 
    BarChart3, 
    CheckCircle2 
  } from 'lucide-svelte';

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
  
  // Aggregates used in summary and progress visuals
  $: successTotal = derivedStats.totalLikes + derivedStats.totalReplies + derivedStats.totalDMs;
  $: pendingRatio = (derivedStats.pendingActions / Math.max(derivedStats.totalComments, 1)) * 100;
  
  let previousStats = { ...derivedStats };

  type CounterKey = 'totalLikes' | 'totalReplies' | 'totalDMs' | 'pendingActions' | 'totalErrors' | 'success';

  // Card definitions aligned with the React template (icons, labels, colors)
  const cardDefs: Array<{
    key: CounterKey;
    label: string;
    icon: any;
    iconBg: string;
    stripe: string;
    showTrend?: boolean;
  }> = [
    { key: 'totalLikes', label: 'Likes', icon: Heart, iconBg: 'bg-pink-500', stripe: 'from-pink-500 to-rose-500', showTrend: true },
    { key: 'totalReplies', label: 'Replies', icon: MessageCircle, iconBg: 'bg-blue-500', stripe: 'from-blue-500 to-indigo-500', showTrend: true },
    { key: 'totalDMs', label: 'DMs', icon: Mail, iconBg: 'bg-green-500', stripe: 'from-green-500 to-emerald-500', showTrend: true },
    { key: 'pendingActions', label: 'Pending', icon: Clock, iconBg: 'bg-yellow-500', stripe: 'from-amber-500 to-orange-500' },
    { key: 'totalErrors', label: 'Errors', icon: AlertCircle, iconBg: 'bg-red-500', stripe: 'from-red-500 to-rose-500' },
    { key: 'success', label: 'Success', icon: CheckCircle2, iconBg: 'bg-violet-500', stripe: 'from-violet-500 to-purple-500' },
  ];

  // Build render-time cards with values and short-term trend from previous render
  $: statCards = cardDefs.map((def) => {
    const current = def.key === 'success' 
      ? Number(successTotal) 
      : Number((derivedStats as any)[def.key] || 0);
    const prev = Number(previousStats[def.key] || 0);
    let trend: number | undefined = undefined;
    if (def.showTrend) {
      if (prev === 0) trend = current > 0 ? 100 : 0;
      else trend = Math.round(((current - prev) / Math.max(prev, 1)) * 100);
    }
    return { ...def, value: current, trend };
  });

  // Track previous success for animation purposes
  let previousSuccess = successTotal;

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
    cardDefs.forEach((def, index) => {
      const currentValue = def.key === 'success'
        ? Number(successTotal)
        : Number((derivedStats as any)[def.key] || 0);
      const previousValue = def.key === 'success'
        ? Number(previousSuccess || 0)
        : Number(previousStats[def.key] || 0);
      if (counterElements[index] && currentValue !== previousValue) {
        animateCounterChange(counterElements[index], currentValue, previousValue);
      }
    });
    // Update previous stats for next-frame comparisons
    previousStats = { ...derivedStats } as any;
    previousSuccess = successTotal;
  }
</script>

<div class="counters-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4" role="region" aria-labelledby="analytics-heading">
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2 min-w-0">
      <BarChart3 class="h-6 w-6 text-blue-600" aria-hidden="true" />
      <h2 id="analytics-heading" class="text-sm font-semibold text-gray-900 truncate">Real-Time Analytics</h2>
    </div>
    <div class="flex items-center gap-2 text-xs text-gray-500" title="Live updates active">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span class="sr-only">Live</span>
    </div>
  </div>
  
  <div class="grid grid-cols-2 gap-4">
    {#each statCards as card, index}
      <div
        bind:this={counterElements[index]}
        class="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm p-0 group"
        aria-label="{card.label}: {card.value}"
      >
        <div class="flex flex-row items-center justify-between space-y-0 pb-2 px-6 pt-4">
          <div class="text-sm font-medium text-gray-500">{card.label}</div>
          <div class={`p-1.5 rounded-md ${card.iconBg}`}>
            <svelte:component this={card.icon} class="h-4 w-4 text-white" aria-hidden="true" />
          </div>
        </div>
        <div class="px-6 pb-5">
          <div class="counter-number text-2xl font-bold text-gray-900">{card.value}</div>
          
        </div>

        <!-- Decorative gradient stripe to echo template style -->
        <div class={`absolute right-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-full bg-gradient-to-b ${card.stripe} opacity-70 group-hover:opacity-100 transition-opacity`}></div>

        <!-- Pending linear progress across bottom edge -->
        {#if card.key === 'pendingActions' && derivedStats.pendingActions > 0}
          <div class="absolute left-0 right-0 bottom-0 h-1 bg-gray-100 overflow-hidden">
            <div class={`h-full bg-gradient-to-r ${card.stripe}`} style="width: {Math.min(pendingRatio, 100)}%"></div>
          </div>
        {/if}
      </div>
    {/each}
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
