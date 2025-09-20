import { writable } from 'svelte/store';

export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  description: string;
  type: 'feature' | 'improvement' | 'bugfix' | 'breaking';
}

export interface ChangelogVersion {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

const initialChangelog: ChangelogVersion[] = [
  {
    version: 'v1.1.0',
    date: '2025-09-21',
    entries: [
      {
        id: 'v1.1.0-feature-1',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Changelog UI and store',
        description: 'Added a dedicated changelog store and interface so users can track version updates inside the extension.',
        type: 'feature'
      },
      {
        id: 'v1.1.0-feature-2',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Manual reply templates',
        description: 'Introduced manual reply templates for situations where AI-powered messaging is disabled.',
        type: 'feature'
      },
      {
        id: 'v1.1.0-improvement-1',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'LinkedIn URL parsing utility',
        description: 'Enhanced LinkedIn URL parsing with a reusable utility module for consistent profile detection.',
        type: 'improvement'
      },
      {
        id: 'v1.1.0-improvement-2',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Pipeline delay indicator',
        description: 'Added a countdown indicator during pipeline execution to visualize scheduled delays.',
        type: 'improvement'
      },
      {
        id: 'v1.1.0-improvement-3',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Control styling refresh',
        description: 'Improved the stop button visuals and refined changelog container styling for better readability.',
        type: 'improvement'
      },
      {
        id: 'v1.1.0-improvement-4',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Navigation ordering',
        description: 'Moved the changelog navigation item to the bottom of the menu for clearer prioritization.',
        type: 'improvement'
      },
      {
        id: 'v1.1.0-improvement-5',
        version: 'v1.1.0',
        date: '2025-10-05',
        title: 'Simplified AI settings',
        description: 'Removed the unnecessary Save Config button from AI settings to streamline the workflow.',
        type: 'improvement'
      }
    ]
  },
  {
    version: 'v1.0.0',
    date: '2025-09-14',
    entries: [
      {
        id: '1',
        version: 'v1.0.0',
        date: '2025-09-14',
        title: 'Initial Release',
        description: 'LinkedIn Life Saver extension with core automation features, sidebar interface, and user authentication.',
        type: 'feature'
      }
    ]
  }
];

function createChangelogStore() {
  const { subscribe, set, update } = writable<ChangelogVersion[]>(initialChangelog);

  return {
    subscribe,
    addEntry: (entry: Omit<ChangelogEntry, 'id' | 'date'>) => {
      update(versions => {
        const newEntry: ChangelogEntry = {
          ...entry,
          id: Date.now().toString(),
          date: new Date().toISOString().split('T')[0]
        };

        const existingVersionIndex = versions.findIndex(v => v.version === entry.version);

        if (existingVersionIndex >= 0) {
          versions[existingVersionIndex].entries.unshift(newEntry);
        } else {
          const newVersion: ChangelogVersion = {
            version: entry.version,
            date: newEntry.date,
            entries: [newEntry]
          };
          versions.unshift(newVersion);
        }

        return versions;
      });
    },
    deleteEntry: (entryId: string) => {
      update(versions => {
        return versions.map(version => ({
          ...version,
          entries: version.entries.filter(entry => entry.id !== entryId)
        })).filter(version => version.entries.length > 0);
      });
    },
    reset: () => set(initialChangelog)
  };
}

export const changelogStore = createChangelogStore();
