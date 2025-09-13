<script lang="ts">
  import { comments, uiState } from '../store';
  import type { Comment } from '../../shared/types';

  type StepStatus = 'complete' | 'active' | 'pending' | 'failed';

  // Skeleton component for loading state
  function renderSkeleton() {
    return Array.from({ length: 3 }).map((_, i) => ({
      id: `skeleton-${i}`,
      isSkeleton: true
    }));
  }

  // Get stepper statuses for a comment using precise TSX logic
  function getStepperStatuses(comment: Comment) {
    // Rule for Step 1: 'Queued'
    // A comment in the list is by definition queued and this step is complete.
    const queuedStatus: StepStatus = 'complete';

    // Rule for Step 2: 'Liked'
    let likedStatus: StepStatus;
    if (comment.likeStatus === 'DONE') {
      likedStatus = 'complete';
    } else if (comment.likeStatus === 'FAILED') {
      likedStatus = 'failed';
    } else {
      // likeStatus is ''
      // If the 'Queued' step is complete, this one is active.
      likedStatus = 'active';
    }

    // Rule for Step 3: 'Replied'
    let repliedStatus: StepStatus;
    if (comment.replyStatus === 'DONE') {
      repliedStatus = 'complete';
    } else if (comment.replyStatus === 'FAILED') {
      repliedStatus = 'failed';
    } else if (comment.likeStatus === 'DONE' && comment.replyStatus === '') {
      // It can only be active if the previous step ('Liked') is complete.
      repliedStatus = 'active';
    } else {
      // It's pending if the 'Liked' step isn't done yet.
      repliedStatus = 'pending';
    }

    // Rule for Step 4: 'DM Sent'
    let dmSentStatus: StepStatus;
    if (comment.dmStatus === 'DONE') {
      dmSentStatus = 'complete';
    } else if (comment.dmStatus === 'FAILED') {
      dmSentStatus = 'failed';
    } else if (comment.replyStatus === 'DONE' && comment.dmStatus === '') {
      // It can only be active if the previous step ('Replied') is complete.
      dmSentStatus = 'active';
    } else {
      // It's pending if the 'Replied' step isn't done yet.
      dmSentStatus = 'pending';
    }
    
    return [queuedStatus, likedStatus, repliedStatus, dmSentStatus];
  }

  // Extract author from profile URL
  function getAuthor(ownerProfileUrl: string): string {
    return ownerProfileUrl.split('/in/')[1]?.replace('/', '') || 'Unknown';
  }

  // Truncate text if too long
  function truncateText(text: string, maxLength: number = 100): string {
    return text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text;
  }

  $: isInitializing = $uiState.isInitializing;
</script>

<div class="sidebar-section" data-testid="pipeline-progress">
  <h2>Pipeline Progress</h2>
  {#if isInitializing && $comments.length === 0}
    <!-- Skeleton Loading State -->
    <div class="pipeline-list">
       {#each renderSkeleton() as skeleton (skeleton.id)}
         <div class="comment-row">
           <div class="comment-info">
             <div class="skeleton-author"></div>
             <div class="skeleton-text"></div>
           </div>
           <div class="stepper-container">
             <div class="skeleton-stepper"></div>
           </div>
         </div>
       {/each}
     </div>
  {:else}
    <div class="pipeline-list">
      {#if $comments.length === 0}
        <p class="idle-message">
          Pipeline is idle. Start processing to see progress.
        </p>
      {:else}
        {#each $comments as comment (comment.commentId)}
          {@const author = getAuthor(comment.ownerProfileUrl)}
          {@const shortText = truncateText(comment.text)}
          {@const stepStatuses = getStepperStatuses(comment)}
          {@const steps = ['Queued', 'Liked', 'Replied', 'DM Sent']}
          
          <div 
            class="comment-row"
            data-testid="pipeline-row-{comment.commentId}"
            data-comment-id={comment.commentId}
          >
            <div class="comment-info">
              <p class="comment-author">{author}</p>
              <p class="comment-text" title={comment.text}>
                {shortText}
              </p>
            </div>
            <div class="stepper-horizontal">
              {#each steps as step, index}
                <div class="step-wrapper">
                  <div 
                    class="step-circle step-{stepStatuses[index]}" 
                    data-testid="step-indicator-{step.replace(' ', '-')}"
                  >
                    {#if stepStatuses[index] === 'complete'}
                      ✓
                    {:else if stepStatuses[index] === 'failed'}
                      ✗
                    {:else}
                      {index + 1}
                    {/if}
                  </div>
                  <span class="step-name">{step}</span>
                  {#if index < steps.length - 1}
                    <div class="step-connector step-connector-{stepStatuses[index + 1] === 'complete' ? 'complete' : 'incomplete'}"></div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Pipeline Container */
  .pipeline-list {
    @apply space-y-4;
  }

  /* Comment Row - Horizontal Layout */
  .comment-row {
    @apply flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm;
  }

  /* Comment Info - Left Side */
  .comment-info {
    @apply flex-shrink-0 w-48 mr-6;
  }

  .comment-author {
    @apply text-base font-semibold text-gray-900 mb-1 truncate;
  }

  .comment-text {
    @apply text-sm text-gray-700 leading-relaxed line-clamp-2;
  }

  /* Horizontal Stepper - Right Side */
  .stepper-horizontal {
    @apply flex items-center flex-1;
  }

  /* Step Wrapper */
  .step-wrapper {
    @apply flex items-center flex-1 relative;
  }

  .step-wrapper:last-child {
    @apply flex-none;
  }

  /* Step Circle */
  .step-circle {
    @apply w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-200 relative z-10;
  }

  .step-circle.step-complete {
    @apply bg-green-500 border-green-500 text-white;
  }

  .step-circle.step-active {
    @apply bg-blue-500 border-blue-500 text-white animate-pulse;
  }

  .step-circle.step-pending {
    @apply bg-gray-100 border-gray-300 text-gray-500;
  }

  .step-circle.step-failed {
    @apply bg-red-500 border-red-500 text-white;
  }

  /* Step Name */
  .step-name {
    @apply absolute top-10 left-1/2 transform -translate-x-1/2 text-sm font-medium text-gray-800 whitespace-nowrap;
  }

  /* Step Connector Line */
  .step-connector {
    @apply flex-1 h-0.5 mx-2 transition-all duration-200;
  }

  .step-connector.step-connector-complete {
    @apply bg-green-400;
  }

  .step-connector.step-connector-incomplete {
    @apply bg-gray-300;
  }

  /* Skeleton styles */
  .skeleton-author {
    @apply h-4 w-20 bg-gray-200 rounded animate-pulse mb-2;
  }

  .skeleton-text {
    @apply h-3 w-32 bg-gray-200 rounded animate-pulse;
  }

  .skeleton-stepper {
    @apply h-16 w-full bg-gray-200 rounded animate-pulse;
  }

  /* Idle message */
  .idle-message {
    @apply text-center text-gray-700 py-8 px-4 text-base;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .comment-row {
      @apply flex-col items-start space-y-4;
    }
    
    .comment-info {
      @apply w-full mr-0;
    }
    
    .stepper-horizontal {
      @apply w-full;
    }
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
</style>
