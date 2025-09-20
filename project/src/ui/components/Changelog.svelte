<script lang="ts">
  import { GitBranch, Bug, Sparkles, Zap, Calendar, Tag } from 'lucide-svelte';
  import { changelogStore } from '../store/changelog';

  const entryTypes = [
    { value: 'feature', label: 'Feature', icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { value: 'improvement', label: 'Improvement', icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { value: 'bugfix', label: 'Bug Fix', icon: Bug, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { value: 'breaking', label: 'Breaking', icon: GitBranch, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }
  ];

  function getTypeConfig(type: string) {
    return entryTypes.find(t => t.value === type) || entryTypes[0];
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
</script>

<div class="changelog-container">
  <!-- Header -->
  <div class="changelog-header">
    <div class="flex items-center gap-3 mb-1">
      <div class="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
        <GitBranch size={20} />
      </div>
      <h2 class="text-2xl font-bold text-gray-900">Changelog</h2>
    </div>
    <p class="text-gray-600 mb-6">Track version updates and changes</p>
  </div>

  <!-- Changelog Entries -->
  <div class="changelog-timeline">
    {#each $changelogStore as version (version.version)}
      <div class="version-section">
        <div class="version-header">
          <div class="flex items-center gap-3">
            <div class="version-badge">
              <Tag size={14} />
              {version.version}
            </div>
            <div class="version-date">
              <Calendar size={14} />
              {formatDate(version.date)}
            </div>
          </div>
        </div>

        <div class="entries-list">
          {#each version.entries as entry (entry.id)}
            {@const typeConfig = getTypeConfig(entry.type)}
            <div class="entry-card">
              <div class="entry-content">
                <div class="entry-header">
                  <div class="entry-type {typeConfig.bg} {typeConfig.border}">
                    <svelte:component this={typeConfig.icon} size={14} class={typeConfig.color} />
                    <span class="text-xs font-medium {typeConfig.color}">
                      {typeConfig.label}
                    </span>
                  </div>
                </div>

                <h4 class="entry-title">{entry.title}</h4>
                <p class="entry-description">{entry.description}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .changelog-container {
    max-width: 100%;
    margin: 0 auto;
  }

  .changelog-header {
    margin-bottom: 2rem;
  }

  .changelog-timeline {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .version-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .version-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    color: white;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .version-date {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    color: #6b7280;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .entries-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .entry-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.25rem;
    transition: all 200ms ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .entry-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .entry-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-bottom: 0.75rem;
  }

  .entry-type {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }

  .entry-title {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }

  .entry-description {
    color: #6b7280;
    line-height: 1.5;
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .changelog-container {
      padding: 0 0.25rem;
    }

    .version-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
