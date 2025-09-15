# LinkedIn Life Saver - UI Structure Documentation

## Overview

This document provides a comprehensive map of the UI structure, components, selectors, buttons, and implementation logic for the LinkedIn Life Saver extension.

## Project Structure

```
src/ui/
├── App.svelte                 # Root application component
├── components/                 # Reusable UI components
│   ├── AiSettings.svelte      # AI configuration settings
│   ├── Controls.svelte        # Pipeline control buttons and settings
│   ├── Counters.svelte        # Statistics display counters
│   ├── Header.svelte          # Status header with indicators
│   ├── LogsPanel.svelte       # Logs display panel
│   └── PipelineProgress.svelte # Comment processing progress tracker
├── store/                      # State management
│   └── index.ts               # Svelte stores and state logic
└── utils/                      # Utility functions
```

## Component Architecture

### Root Component: App.svelte

**File**: `src/ui/App.svelte`

**Key Selectors**:

- `#sidebar-app` - Main application container
- `.sidebar` - Sidebar styling class
- `.ui-scale` - Scaling container for responsive design

**Structure**:

```html
<div id="sidebar-app" class="sidebar p-6 animate-fade-in">
  <div class="ui-scale">
    <!-- Header with logo and title -->
    <div class="mb-6">
      <h1
        class="text-3xl font-bold text-white mb-1 animate-slide-up flex items-center gap-3"
      >
        <img src="logo.svg" alt="LinkedIn Life Saver Logo" class="w-8 h-8" />
        LinkedIn Life Saver
      </h1>
    </div>

    <!-- Component sections -->
    <div class="space-y-4">
      <header />
      <Counters />
      <PipelineProgress />
      <Controls />
      <AiSettings />
      <LogsPanel />
    </div>
  </div>
</div>
```

**Logic**:

- Initializes GSAP animations on mount
- Sets up Chrome extension message listeners
- Handles state updates and log entries from background script
- Manages component lifecycle and cleanup

---

### Header Component

**File**: `src/ui/components/Header.svelte`

**Key Selectors**:

- `.header-container` - Main header wrapper
- `.status-indicator` - Pipeline status indicator circle
- `.status-text` - Status text display

**Status States**:

- `idle`: Gray indicator, "Ready" text
- `running`: Green pulsing indicator, "Running" text with animated bars
- `paused`: Amber indicator, "Paused" text with pause icon
- `error`: Red pulsing indicator, "Error" text with warning icon

**Visual Elements**:

```html
<div
  class="header-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4"
>
  <div class="flex items-center justify-between">
    <!-- Status indicator with dynamic colors -->
    <div class="status-indicator w-4 h-4 rounded-full {currentStatus.bgColor}">
      <div class="w-2 h-2 rounded-full bg-current {currentStatus.color}"></div>
    </div>

    <!-- Action indicators (animated bars, icons) -->
    <div class="flex items-center space-x-2">
      <!-- Dynamic content based on pipeline status -->
    </div>
  </div>

  <!-- Progress bar for running state -->
  {#if $pipelineStatus === 'running'}
  <div class="mt-3 bg-gray-100 rounded-full h-1.5">
    <div
      class="h-full bg-gradient-to-r from-primary-500 to-secondary-500 animate-progress-bar"
    ></div>
  </div>
  {/if}
</div>
```

---

### Controls Component

**File**: `src/ui/components/Controls.svelte`

**Key Selectors**:

- `.controls-container` - Main controls wrapper
- `.control-button` - Primary action buttons
- `.secondary-button` - Secondary action buttons
- `#start`, `#pause`, `#resume`, `#stop` - Specific button IDs

**Primary Control Buttons**:

1. **Start Pipeline Button**
   - **ID**: `start`
   - **Classes**: `control-button bg-gradient-to-r from-emerald-500 to-teal-500`
   - **Action**: `startPipeline()`
   - **Visible**: When pipeline status is `idle` or `error`

2. **Pause Pipeline Button**
   - **ID**: `pause`
   - **Classes**: `control-button bg-gradient-to-r from-amber-500 to-orange-500`
   - **Action**: `pausePipeline()`
   - **Visible**: When pipeline status is `running`

3. **Resume Pipeline Button**
   - **ID**: `resume`
   - **Classes**: `control-button bg-gradient-to-r from-blue-500 to-indigo-500`
   - **Action**: `resumePipeline()`
   - **Visible**: When pipeline status is `paused`

4. **Stop Pipeline Button**
   - **ID**: `stop`
   - **Classes**: `control-button bg-gradient-to-r from-red-500 to-pink-500`
   - **Action**: `stopPipeline()`
   - **Visible**: When pipeline status is `running` or `paused`

**Settings Controls**:

```html
<!-- Comments to Fetch -->
<input
  id="max-comments"
  type="number"
  min="1"
  max="1000"
  bind:value="{maxComments}"
/>

<!-- Delay Range -->
<input
  type="number"
  min="1000"
  max="60000"
  step="1000"
  bind:value="{delayMin}"
/>
<input
  type="number"
  min="1000"
  max="60000"
  step="1000"
  bind:value="{delayMax}"
/>
```

**Secondary Action Buttons**:

1. **Export JSON Button**
   - **Test ID**: `export-json-button`
   - **Classes**: `secondary-button bg-gradient-to-r from-green-100 to-emerald-100`
   - **Action**: `handleExportJSON()`

2. **Export Logs Button**
   - **Test ID**: `export-logs-button`
   - **Classes**: `secondary-button bg-gradient-to-r from-blue-100 to-indigo-100`
   - **Action**: `handleExportLogs()`

3. **Reset Session Button**
   - **Test ID**: `reset-session-button`
   - **Classes**: `secondary-button bg-gradient-to-r from-red-100 to-pink-100`
   - **Action**: `handleResetSession()`

**Message Types Sent**:

- `START_PIPELINE` - Starts the comment processing pipeline
- `STOP_PIPELINE` - Pauses the pipeline
- `RESUME_PIPELINE` - Resumes a paused pipeline
- `RESET_PIPELINE` - Stops and resets the pipeline
- `UPDATE_SETTINGS` - Updates pipeline settings
- `EXPORT_JSON` - Exports processed data as JSON
- `EXPORT_LOGS` - Exports application logs
- `RESET_SESSION` - Resets the current session

---

### Pipeline Progress Component

**File**: `src/ui/components/PipelineProgress.svelte`

**Key Selectors**:

- `[data-testid="pipeline-progress"]` - Main progress container
- `[data-testid="pipeline-row-{commentId}"]` - Individual comment rows
- `[data-comment-id="{commentId}"]` - Comment identification attribute
- `[data-testid="step-indicator-{step}"]` - Step indicator elements

**Step Indicators**:

1. **Queued** - Always complete for comments in the list
2. **Liked** - Shows like action status
3. **Replied** - Shows reply action status
4. **DM Sent** - Shows direct message status

**Step Status Classes**:

- `.step-complete` - Green circle with checkmark (✓)
- `.step-active` - Blue pulsing circle with step number
- `.step-pending` - Gray circle with step number
- `.step-failed` - Red circle with X mark (✗)

**Structure**:

```html
<div data-testid="pipeline-progress">
  {#each $comments as comment}
  <div
    data-testid="pipeline-row-{comment.commentId}"
    data-comment-id="{comment.commentId}"
  >
    <!-- Comment info -->
    <div class="comment-info">
      <p class="comment-author">{author}</p>
      <p class="comment-text">{shortText}</p>
    </div>

    <!-- Horizontal stepper -->
    <div class="stepper-horizontal">
      {#each steps as step, index}
      <div class="step-wrapper">
        <div
          class="step-circle step-{stepStatuses[index]}"
          data-testid="step-indicator-{step.replace(' ', '-')}"
        >
          <!-- Step content (✓, ✗, or number) -->
        </div>
        <span class="step-name">{step}</span>
        <!-- Connector line -->
      </div>
      {/each}
    </div>
  </div>
  {/each}
</div>
```

**Logic**:

- Calculates step statuses based on comment action states
- Renders skeleton loading state during initialization
- Displays idle message when no comments are present
- Extracts author names from LinkedIn profile URLs
- Truncates long comment text for display

---

### Counters Component

**File**: `src/ui/components/Counters.svelte`

**Key Selectors**:

- `.counters-container` - Main counters wrapper
- `.counter-card` - Individual counter cards
- `.counter-number` - Counter value display

**Counter Types**:

1. **Likes** - 👍 Pink gradient, tracks completed likes
2. **Replies** - 💬 Blue gradient, tracks completed replies
3. **DMs** - 📩 Purple gradient, tracks completed direct messages
4. **Comments** - 📝 Green gradient, tracks total comments
5. **Pending** - ⏳ Amber gradient, tracks pending actions
6. **Errors** - ⚠️ Red gradient, tracks failed actions

**Structure**:

```html
<div
  class="counters-container bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4"
>
  <div class="grid grid-cols-2 gap-3">
    {#each counterConfig as config, index}
    <div class="counter-card {config.bgColor} rounded-lg p-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span class="text-lg">{config.icon}</span>
          <div>
            <div class="counter-number text-2xl font-bold {config.textColor}">
              {derivedStats[config.key]}
            </div>
            <div class="text-sm {config.textColor}">{config.label}</div>
          </div>
        </div>
        <!-- Gradient accent bar -->
      </div>
      <!-- Progress indicator for pending actions -->
    </div>
    {/each}
  </div>
</div>
```

**Logic**:

- Derives statistics from comment states in real-time
- Animates counter changes with GSAP
- Shows progress bar for pending actions
- Responsive grid layout (2 columns on desktop, 1 on mobile)

---

## State Management

**File**: `src/ui/store/index.ts`

**Key Stores**:

- `uiState` - Main application state
- `logs` - Application logs
- `pipelineStatus` - Derived pipeline status
- `stats` - Derived statistics
- `comments` - Derived comments array
- `postUrn` - Derived post URN

**Store Methods**:

- `updateState(newState)` - Updates partial UI state
- `setPipelineStatus(status)` - Sets pipeline run state
- `updateStats(stats)` - Updates statistics
- `updateComments(comments)` - Updates comments array
- `addLog(logEntry)` - Adds new log entry
- `clearLogs()` - Clears all logs
- `setPostUrn(urn)` - Sets current post URN
- `reset()` - Resets to initial state
- `getState()` - Returns current state snapshot

## Data Types

**File**: `src/shared/types.ts`

**Key Interfaces**:

### Comment

```typescript
interface Comment {
  commentId: string;
  text: string;
  ownerProfileUrl: string;
  timestamp: string;
  type: 'top-level' | 'reply';
  connected?: boolean;
  threadId: string;
  likeStatus: '' | 'DONE' | 'FAILED' | 'SKIPPED';
  replyStatus: '' | 'DONE' | 'FAILED' | 'SKIPPED';
  dmStatus: '' | 'DONE' | 'FAILED' | 'SKIPPED';
  attempts: { like: number; reply: number; dm: number };
  lastError: string;
  pipeline: {
    queuedAt: string;
    likedAt: string;
    repliedAt: string;
    dmAt: string;
    generatedReply?: string;
    generatedDm?: string;
  };
}
```

### UIState

```typescript
interface UIState {
  isInitializing: boolean;
  pipelineStatus: 'idle' | 'running' | 'paused' | 'error';
  stats: {
    totalTopLevelNoReplies: number;
    userTopLevelNoReplies: number;
  };
  comments: Comment[];
  postUrn?: string;
  userProfileUrl?: string;
  postAuthor?: string;
  postTimestamp?: string;
  aiConfig?: AIConfig;
}
```

### Extension Messages

```typescript
type ExtensionMessage =
  | { type: 'STATE_UPDATE'; payload: Partial<UIState> }
  | { type: 'LOG_ENTRY'; payload: LogEntry }
  | {
      type: 'START_PIPELINE';
      payload: {
        postUrn?: string;
        maxComments?: number;
        delayMin?: number;
        delayMax?: number;
      };
    }
  | { type: 'STOP_PIPELINE' }
  | { type: 'RESUME_PIPELINE' }
  | { type: 'RESET_PIPELINE' }
  | { type: 'UPDATE_SETTINGS'; payload: any }
  | { type: 'EXPORT_JSON'; postUrn: string }
  | { type: 'EXPORT_LOGS' }
  | { type: 'RESET_SESSION'; postUrn: string };
```

## Animation System

**Library**: GSAP (GreenSock Animation Platform)

**Common Animations**:

- **Fade In**: `opacity: 0 → 1` with `y: 20 → 0`
- **Scale Bounce**: `scale: 0.8 → 1` with `back.out(1.7)` easing
- **Button Click**: `scale: 1 → 0.95 → 1` on interaction
- **Counter Changes**: Number counting with scale bounce
- **Status Changes**: Scale pulse animation
- **Progress Bar**: Sliding gradient animation

**Accessibility**: All animations respect `prefers-reduced-motion` media query

## Styling System

**Framework**: Tailwind CSS

**Key Design Tokens**:

- **Colors**: Gradient-based with semantic color mapping
- **Spacing**: Consistent 4px grid system
- **Typography**: Font weight and size hierarchy
- **Shadows**: Layered shadow system for depth
- **Borders**: Rounded corners with consistent radius
- **Backdrop**: Blur effects for modern glass morphism

**Responsive Breakpoints**:

- `640px` - Small tablets
- `480px` - Large phones
- `320px` - Small phones

## Testing Selectors

**Data Test IDs**:

- `data-testid="pipeline-progress"` - Pipeline progress container
- `data-testid="pipeline-row-{commentId}"` - Comment progress rows
- `data-testid="step-indicator-{step}"` - Step indicator elements
- `data-testid="export-json-button"` - Export JSON button
- `data-testid="export-logs-button"` - Export logs button
- `data-testid="reset-session-button"` - Reset session button

**Data Attributes**:

- `data-comment-id="{commentId}"` - Comment identification
- `id="{buttonAction}"` - Button identification (start, pause, resume, stop)

## Browser Extension Integration

**Chrome APIs Used**:

- `chrome.runtime.sendMessage()` - Send messages to background script
- `chrome.runtime.onMessage` - Listen for background messages
- `chrome.runtime.getURL()` - Get extension resource URLs
- `chrome.runtime.lastError` - Handle runtime errors

**Message Flow**:

1. UI sends action messages to background script
2. Background script processes actions and updates state
3. Background script sends state updates back to UI
4. UI updates components reactively through Svelte stores

---

_This documentation reflects the current implementation as of the latest codebase analysis. Components use modern Svelte 3+ syntax with TypeScript integration and follow accessibility best practices._
