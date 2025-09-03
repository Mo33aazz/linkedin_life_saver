import { h } from 'preact';

export const Skeleton = ({ className, style }: { className?: string, style?: h.JSX.CSSProperties }) => {
  return <div className={`skeleton-loader ${className || ''}`} style={style} />;
};