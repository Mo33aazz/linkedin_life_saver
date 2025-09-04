import { useStore } from '../store';
import { Comment, ActionStatus } from '../../shared/types';
import { Skeleton } from './Skeleton';

type StepStatus = 'complete' | 'active' | 'pending' | 'failed';

type StepperProps = {
  likeStatus: ActionStatus;
  replyStatus: ActionStatus;
  dmStatus: ActionStatus;
};

const Stepper = ({ likeStatus, replyStatus, dmStatus }: StepperProps) => {
  const steps = ['Queued', 'Liked', 'Replied', 'DM Sent'];

  // Rule for Step 1: 'Queued'
  // A comment in the list is by definition queued and this step is complete.
  const queuedStatus: StepStatus = 'complete';

  // Rule for Step 2: 'Liked'
  let likedStatus: StepStatus;
  if (likeStatus === 'DONE') {
    likedStatus = 'complete';
  } else if (likeStatus === 'FAILED') {
    likedStatus = 'failed';
  } else {
    // likeStatus is ''
    // If the 'Queued' step is complete, this one is active.
    likedStatus = 'active';
  }

  // Rule for Step 3: 'Replied'
  let repliedStatus: StepStatus;
  if (replyStatus === 'DONE') {
    repliedStatus = 'complete';
  } else if (replyStatus === 'FAILED') {
    repliedStatus = 'failed';
  } else if (likeStatus === 'DONE' && replyStatus === '') {
    // It can only be active if the previous step ('Liked') is complete.
    repliedStatus = 'active';
  } else {
    // It's pending if the 'Liked' step isn't done yet.
    repliedStatus = 'pending';
  }

  // Rule for Step 4: 'DM Sent'
  let dmSentStatus: StepStatus;
  if (dmStatus === 'DONE') {
    dmSentStatus = 'complete';
  } else if (dmStatus === 'FAILED') {
    dmSentStatus = 'failed';
  } else if (replyStatus === 'DONE' && dmStatus === '') {
    // It can only be active if the previous step ('Replied') is complete.
    dmSentStatus = 'active';
  } else {
    // It's pending if the 'Replied' step isn't done yet.
    dmSentStatus = 'pending';
  }

  const statuses: StepStatus[] = [
    queuedStatus,
    likedStatus,
    repliedStatus,
    dmSentStatus,
  ];

  return (
    <div className="stepper-container">
      {steps.map((step, index) => (
        <div key={step} className={`step-item step-${statuses[index]}`}>
          <div className="step-indicator" data-testid="status-indicator" />
          <p className="step-label" data-testid="status-indicator">{step}</p>
        </div>
      ))}
    </div>
  );
};

const CommentRow = ({ comment }: { comment: Comment }) => {
  const author =
    comment.ownerProfileUrl.split('/in/')[1]?.replace('/', '') || 'Unknown';
  const shortText =
    comment.text.length > 100
      ? `${comment.text.substring(0, 97)}...`
      : comment.text;

  return (
    <div 
      className="comment-row"
      data-testid={`pipeline-row-${comment.commentId}`}
      data-comment-id={comment.commentId}
    >
      <div className="comment-info">
        <p className="comment-author">{author}</p>
        <p className="comment-text" title={comment.text}>
          {shortText}
        </p>
      </div>
      <Stepper
        likeStatus={comment.likeStatus}
        replyStatus={comment.replyStatus}
        dmStatus={comment.dmStatus}
      />
    </div>
  );
};

const PipelineProgressSkeleton = () => (
    <div className="pipeline-list">
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="comment-row" key={i}>
          <div className="comment-info">
            <Skeleton className="skeleton-author" />
            <Skeleton className="skeleton-text" />
          </div>
          <div className="stepper-container">
             <Skeleton className="skeleton-stepper" />
          </div>
        </div>
      ))}
    </div>
  );

export const PipelineProgress = () => {
  const comments = useStore((state) => state.comments);
  const isInitializing = useStore((state) => state.isInitializing);
  const pipelineStatus = useStore((state) => state.pipelineStatus);

  return (
    <div className="sidebar-section" data-testid="pipeline-progress">
      <h2>Pipeline Progress</h2>
      <div data-testid="pipeline-status" className="pipeline-status">
        Status: {pipelineStatus}
      </div>
      {isInitializing && comments.length === 0 ? (
        <PipelineProgressSkeleton />
      ) : (
        <div className="pipeline-list">
          {comments.length === 0 ? (
            <p className="idle-message">
              Pipeline is idle. Start processing to see progress.
            </p>
          ) : (
            comments.map((comment) => (
              <CommentRow key={comment.commentId} comment={comment} />
            ))
          )}
        </div>
      )}
    </div>
  );
};