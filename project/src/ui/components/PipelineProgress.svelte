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
    @apply space-y-3;
  }

  /* Comment Row - Enhanced Modern Layout */
  .comment-row {
    @apply flex items-center justify-between p-5 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-sm;
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .comment-row:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06);
  }

  /* Comment Info - Enhanced Left Side */
  .comment-info {
    @apply flex-shrink-0 w-52 mr-6;
  }

  .comment-author {
    @apply text-base font-semibold text-gray-900 mb-1.5 truncate;
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .comment-text {
    @apply text-sm text-gray-600 leading-relaxed line-clamp-2;
    font-weight: 400;
    line-height: 1.5;
  }

  /* Horizontal Stepper - Enhanced Right Side */
  .stepper-horizontal {
    @apply flex items-center flex-1 relative;
    padding: 0.5rem 0;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    box-sizing: border-box;
  }

  /* Step Wrapper */
  .step-wrapper {
    @apply flex items-center flex-1 relative;
  }

  .step-wrapper:last-child {
    @apply flex-none;
  }

  /* Step Circle - Enhanced Design */
  .step-circle {
    @apply w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 relative z-10 shadow-sm;
    backdrop-filter: blur(8px);
  }

  .step-circle.step-complete {
    @apply bg-emerald-500 border-emerald-500 text-white shadow-emerald-200;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
  }

  .step-circle.step-active {
    @apply bg-blue-500 border-blue-500 text-white;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    box-shadow: 0 2px 12px rgba(59, 130, 246, 0.4);
    animation: pulse-glow 2s infinite;
  }

  .step-circle.step-pending {
    @apply bg-gray-50 border-gray-300 text-gray-500;
    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
  }

  .step-circle.step-failed {
    @apply bg-red-500 border-red-500 text-white;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  }

  /* Step Name - Enhanced Typography */
  .step-name {
    @apply absolute top-12 left-1/2 transform -translate-x-1/2 text-xs font-medium text-gray-700 whitespace-nowrap;
    letter-spacing: 0.025em;
  }

  /* Step Connector Line - Enhanced Design */
  .step-connector {
    @apply flex-1 h-1 mx-3 transition-all duration-300 rounded-full;
    background: linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%);
  }

  .step-connector.step-connector-complete {
    @apply bg-emerald-400;
    background: linear-gradient(90deg, #34d399 0%, #10b981 50%, #34d399 100%);
    box-shadow: 0 1px 3px rgba(52, 211, 153, 0.3);
  }

  .step-connector.step-connector-incomplete {
    @apply bg-gray-200;
    background: linear-gradient(90deg, #e5e7eb 0%, #d1d5db 50%, #e5e7eb 100%);
  }

  /* Enhanced Skeleton Styles */
  .skeleton-author {
    @apply h-5 w-24 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-md mb-2;
    animation: shimmer 2s infinite linear;
    background-size: 200% 100%;
  }

  .skeleton-text {
    @apply h-4 w-36 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-md;
    animation: shimmer 2s infinite linear;
    background-size: 200% 100%;
  }

  .skeleton-stepper {
    @apply h-20 w-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-xl;
    animation: shimmer 2s infinite linear;
    background-size: 200% 100%;
  }

  /* Enhanced Idle Message */
  .idle-message {
    @apply text-center text-gray-600 py-12 px-6 text-base;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 1rem;
    border: 1px dashed #cbd5e1;
  }

  /* Enhanced Responsive Design */
  @media (max-width: 768px) {
    .pipeline-container {
      @apply p-4;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      overflow-x: hidden;
    }

    .comment-row {
      @apply flex-col items-start space-y-4 p-4 mx-2;
      min-height: auto;
    }
    
    .comment-info {
      @apply w-full mr-0;
    }
    
    .stepper-horizontal {
      @apply w-full justify-center;
      padding: 0.75rem 0;
      gap: 0.25rem;
      flex-wrap: nowrap;
      overflow-x: auto;
    }

    .step-circle {
      @apply w-8 h-8 text-sm;
      min-width: 2rem;
      min-height: 2rem;
      flex-shrink: 0;
    }

    .step-name {
      @apply text-xs top-10;
      max-width: 3.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .step-connector {
      @apply mx-1 h-0.5;
      min-width: 0.75rem;
      flex: 1;
    }

    .idle-message {
      @apply py-8 px-4 text-sm;
      margin: 1rem;
    }

    .skeleton-stepper {
      @apply h-16;
    }
  }

  @media (max-width: 480px) {
    .pipeline-container {
      @apply p-2;
    }

    .comment-row {
      @apply p-3 rounded-lg mx-1;
    }

    .comment-author {
      @apply text-sm font-semibold;
    }

    .comment-text {
      @apply text-sm leading-relaxed;
      word-break: break-word;
    }

    .stepper-horizontal {
      padding: 0.5rem 0;
      gap: 0.125rem;
      min-height: 50px;
    }

    .step-circle {
      @apply w-7 h-7 text-xs;
      min-width: 1.75rem;
      min-height: 1.75rem;
      flex-shrink: 0;
    }

    .step-name {
      @apply text-xs top-8;
      max-width: 2.5rem;
      word-break: break-word;
      text-align: center;
    }

    .step-connector {
      @apply mx-0.5;
      min-width: 0.5rem;
      flex: 1;
    }

    .idle-message {
      @apply py-6 px-3 text-sm;
      margin: 0.5rem;
    }

    .skeleton-author {
      @apply h-4 w-20;
    }

    .skeleton-text {
      @apply h-3 w-28;
    }

    .skeleton-stepper {
      @apply h-12;
    }
  }

  /* Extra small screens */
  @media (max-width: 360px) {
    .stepper-horizontal {
      @apply flex-col items-center;
      gap: 1rem;
    }

    .step-connector {
      @apply w-0.5 h-4 mx-0;
      /* Vertical connectors for very small screens */
    }

    .step-name {
      @apply relative top-0 left-0 transform-none mt-2;
      max-width: none;
    }
  }

  /* Enhanced Animations */
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 2px 12px rgba(59, 130, 246, 0.4);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.6);
      transform: scale(1.05);
    }
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }

    .step-circle.step-active {
      animation: none;
    }

    .skeleton-author,
    .skeleton-text,
    .skeleton-stepper {
      animation: none;
    }
  }

  /* Focus States for Accessibility */
  .comment-row:focus-within {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>
