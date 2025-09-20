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
    version: 'v1.0.0',
    date: '2025-09-20',
    entries: [
      {
        id: '1',
        version: 'v1.0.0',
        date: '2025-09-20',
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