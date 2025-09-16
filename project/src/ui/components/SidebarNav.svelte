<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { BarChart3, Workflow, Sliders, Settings2, ScrollText } from 'lucide-svelte';

  type Section = {
    id: string;
    label: string;
    icon: typeof BarChart3;
  };

  const sections: Section[] = [
    { id: 'counters', label: 'Counters', icon: BarChart3 },
    { id: 'pipeline', label: 'Pipeline', icon: Workflow },
    { id: 'controls', label: 'Controls', icon: Sliders },
    { id: 'ai-settings', label: 'AI Settings', icon: Settings2 },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ];

  export let active: string | null = null;
  const dispatch = createEventDispatcher<{ navigate: { id: string } }>();

  function handleClick(id: string) {
    console.log('SidebarNav: Button clicked for section:', id);
    dispatch('navigate', { id });
    console.log('SidebarNav: Navigate event dispatched for:', id);
  }
</script>

<nav class="sidebar-nav" aria-label="Section navigation">
  {#each sections as s}
    <button
      type="button"
      class="nav-item {active === s.id ? 'active' : ''}"
      title={s.label}
      aria-current={active === s.id ? 'true' : 'false'}
      on:click={() => handleClick(s.id)}
      on:mousedown={() => console.log('SidebarNav: mousedown on', s.id)}
      on:pointerdown={() => console.log('SidebarNav: pointerdown on', s.id)}
    >
      <s.icon size={18} style="filter: drop-shadow(0 1px 3px rgba(255,255,255,0.1));" />
      <span class="tooltip">{s.label}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: #ffffff;
    border: 1px solid rgba(229, 231, 235, 0.6);
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    align-self: flex-start;
    backdrop-filter: blur(10px);
  }

  .nav-item {
    position: relative;
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.8);
    background: #f9fafb;
    color: #6b7280;
    cursor: pointer;
    transition: all 200ms ease;
    pointer-events: auto;
    z-index: 10;
    user-select: none;
  }

  .nav-item:hover {
    background: #f3f4f6;
    border-color: rgba(209, 213, 219, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    color: #374151;
    transform: translateY(-1px);
  }

  .nav-item.active {
    background: #ffffff;
    border-color: rgba(156, 163, 175, 0.8);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
    color: #111827;
    transform: translateY(-1px);
  }

  .tooltip {
    position: absolute;
    right: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(17, 24, 39, 0.9);
    border: 1px solid rgba(75, 85, 99, 0.3);
    color: #f9fafb;
    font-size: 0.75rem;
    line-height: 1.2;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease;
    z-index: 50;
  }

  /* Tooltips are now hidden - removed hover and active states */
</style>
