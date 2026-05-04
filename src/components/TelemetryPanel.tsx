import { useState, useEffect } from 'react';
import { ClockDisplay } from './ClockDisplay';
import { Thermometer, Database, Cpu, Zap, Activity } from 'lucide-react';
import type { TelemetryData } from '../types';

interface TelemetryPanelProps {
  videosCount: number;
  telemetry: TelemetryData;
}

export function TelemetryPanel({ videosCount, telemetry }: TelemetryPanelProps) {
  const [internalStats, setInternalStats] = useState({
    temp: 42,
    stability: 99.9,
    throughput: 124.5
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setInternalStats(prev => ({
        temp: telemetry.temp ?? Math.min(65, Math.max(38, prev.temp + (Math.random() - 0.5) * 2)),
        stability: 99.8 + Math.random() * 0.2,
        throughput: Math.min(150, Math.max(100, prev.throughput + (Math.random() - 0.5) * 5))
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="telemetry sovereign-glass">
      <div className="tel-group">
        <div className="tel-item" data-tooltip="ACTIVE UNIT COUNT">
          <Activity size={12} className="text-accent" />
          <span className="tel-label">UNITS:</span> {videosCount}
        </div>
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip="CPU CORE LOAD">
          <Cpu size={12} className="text-accent" />
          <span className="tel-label">CPU:</span> {telemetry.cpu}
        </div>
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip="VRAM RESOURCE ALLOCATION">
          <Database size={12} className="text-accent" />
          <span className="tel-label">VRAM:</span> {telemetry.mem}
        </div>
      </div>

      <div className="tel-group hidden-mobile">
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip="GPU THERMAL STATE">
          <Thermometer size={12} className="text-accent" />
          <span className="tel-label">TEMP:</span> {(telemetry.temp ?? internalStats.temp).toFixed(1)}°C
        </div>
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip="SYSTEM STABILITY INDEX">
          <Zap size={12} className="text-accent" />
          <span className="tel-label">STABILITY:</span> {internalStats.stability.toFixed(2)}%
        </div>
      </div>

      <div className="tel-brand">
        <div className="status-indicator online" />
        <span>SOVEREIGN v3.2.5</span>
      </div>
      
      <ClockDisplay />
    </div>
  );
}
