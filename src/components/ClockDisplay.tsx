import { useState, useEffect } from 'react';

export function ClockDisplay() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const update = () => setTime(new Date().toLocaleTimeString());
    const start = () => {
      if (t !== null) return;
      update();
      t = setInterval(update, 1000);
    };
    const stop = () => {
      if (t !== null) {
        clearInterval(t);
        t = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);
  return <div className="tel-item clock-item">{time}</div>;
}
