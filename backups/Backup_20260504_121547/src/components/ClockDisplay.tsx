import { useState, useEffect } from 'react';

export function ClockDisplay() {
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);
  return <div className="tel-item clock-item">{time}</div>;
}
