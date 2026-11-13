import { useState, useEffect } from 'react';
import { isAppActive, subscribeAppActivity } from '../utils/appActivity';

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
    const onActivity = (active: boolean) => {
      if (active) start();
      else stop();
    };
    onActivity(isAppActive());
    const unsubscribe = subscribeAppActivity(onActivity);
    return () => {
      unsubscribe();
      stop();
    };
  }, []);
  return <div className="tel-item clock-item">{time}</div>;
}
