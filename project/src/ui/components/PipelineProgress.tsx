import { h } from 'preact';
import { useStore } from '../store';
import { Comment, ActionStatus } from '../../shared/types';

type StepStatus = 'complete' | 'active' | 'pending' | 'failed';

const Stepper = ({ likeStatus, replyStatus }: { likeStatus: ActionStatus, replyStatus: ActionStatus }) => {
  const steps = ['Queued', 'Liked', 'Replied'];
  
  const statuses: StepStatus[] = steps.map((step, index) => {
    if (index === 0) { // Queued
      return 'complete';
    }
    if (index === 1) { // Liked
      if (likeStatus === 'DONE') return 'complete';
      if (likeStatus === 'FAILED') return 'failed';
      return 'pending'; // Placeholder, will be converted to active if it's the current step
    }
    if (index === 2) { // Replied
      if (replyStatus === 'DONE') return 'complete';
      if (replyStatus === 'FAILED') return 'failed';
      // Can't be active or complete if not liked yet
      if (likeStatus !== 'DONE') return 'pending'; 
      return 'pending'; // Placeholder
    }
    return 'pending';
  });

  // Find the first 'pending' step and mark it as 'active'
  const firstPendingIndex = statuses.findIndex(status => status === 'pending');
  if (firstPendingIndex !== -1) {
    statuses[firstPendingIndex] = 'active';
  }

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