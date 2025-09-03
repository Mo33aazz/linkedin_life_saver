import { useState, useEffect, useRef } from 'preact/hooks';

const easeOutQuad = (t: number) => t * (2 - t);

export const useAnimatedCounter = (endValue: number, duration = 500) => {
  const [count, setCount] = useState(0);
  const startValueRef = useRef(0);
  const startTimeRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
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
  }, [endValue, duration]);

  return count;
};