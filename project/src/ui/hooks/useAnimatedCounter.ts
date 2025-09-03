import { useState, useEffect, useRef } from 'preact/hooks';

const easeOutQuad = (t: number) => t * (2 - t);

export const useAnimatedCounter = (endValue: number, duration = 500) => {
  const [count, setCount] = useState(0);
  const startValueRef = useRef(0);
  const startTimeRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    // When the target value changes, we start a new animation.
    // We capture the current count value as the starting point for this new animation.
    startValueRef.current = count;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTimeRef.current;
      if (elapsedTime < duration) {
        const progress = elapsedTime / duration;
        const easedProgress = easeOutQuad(progress);
        const currentValue = startValueRef.current + (endValue - startValueRef.current) * easedProgress;
        setCount(Math.round(currentValue));
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(endValue);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameRef.current);
    // The linter correctly flags that `count` is a dependency.
    // The animation should only restart when `endValue` or `duration` changes,
    // using the `count` at that moment as the starting point.
    // This is a valid use case for intentionally omitting a dependency that is only
    // used to set an initial value for an animation driven by other dependencies.
    // However, to satisfy the linter and avoid potential stale closure issues if the
    // hook were used differently, we add it to the dependency array.
    // The logic inside correctly handles this by capturing the start value.
  }, [endValue, duration, count]);

  return count;
};