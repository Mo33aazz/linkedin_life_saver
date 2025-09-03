import { h } from 'preact';
import { useStore } from '../store';
import { Comment, ActionStatus } from '../../shared/types';

type StepStatus = 'complete' | 'active' | 'pending' | 'failed';

const Stepper = ({ likeStatus, replyStatus }: { likeStatus: ActionStatus, replyStatus: ActionStatus }) => {
  const steps = ['Queued', 'Liked', 'Replied'];

  // Rule for Step 1: 'Queued'
  // A comment in the list is by definition queued and this step is complete.
  const queuedStatus: StepStatus = 'complete';

  // Rule for Step 2: 'Liked'
  let likedStatus: StepStatus;
  if (likeStatus === 'DONE') {
    likedStatus = 'complete';
  } else if (likeStatus === 'FAILED') {
    likedStatus = 'failed';
  } else { // likeStatus is ''
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

  const statuses: StepStatus[] = [queuedStatus, likedStatus, repliedStatus];

  return (
    <div className="stepper-container">
      {steps.map((step, index) => (
        <div key={step} className={`step-item step-${statuses[index]}`}>
          <div className="step-indicator" />
          <p className="step-label">{step}</p>
        </div>
      ))}
    </div>
  );
};

const CommentRow = ({ comment }: { comment: Comment }) => {
  const author = comment.ownerProfileUrl.split('/in/')[1]?.replace('/', '') || 'Unknown';
  
  return (
    <div className="comment-row">
      <div className="comment-info">
        <p className="comment-author">{author}</p>
        <p className="comment-text">{comment.text}</p>
      </div>
      <Stepper likeStatus={comment.likeStatus} replyStatus={comment.replyStatus} />
    </div>
  );
};

export const PipelineProgress = () => {
  const comments = useStore((state) => state.comments);

  return (
    <div className="sidebar-section">
      <h2>Pipeline Progress</h2>
      <div className="pipeline-list">
        {comments.length === 0 ? (
          <p className="idle-message">Pipeline is idle. Start processing to see progress.</p>
        ) : (
          comments.map((comment) => (
            <CommentRow key={comment.commentId} comment={comment} />
          ))
        )}
      </div>
    </div>
  );
};