import { ClockDisplay } from './ClockDisplay';
import { Thermometer, Database, Cpu, Zap, Activity } from 'lucide-react';
import type { TelemetryData } from '../types';

interface TelemetryPanelProps {
  videosCount: number;
  telemetry: TelemetryData;
}

export function TelemetryPanel({ videosCount, telemetry }: TelemetryPanelProps) {
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
        <div className="tel-item" data-tooltip={`VRAM RESOURCE ALLOCATION (${telemetry.gpu})`}>
          <Database size={12} className="text-accent" />
          <span className="tel-label">VRAM:</span> {telemetry.mem}
        </div>
      </div>

      <div className="tel-group hidden-mobile">
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip={`GPU THERMAL STATE (${telemetry.gpu})`}>
          <Thermometer size={12} className="text-accent" />
          <span className="tel-label">TEMP:</span> {telemetry.temp !== undefined ? `${telemetry.temp.toFixed(1)}°C` : 'N/A'}
        </div>
        <div className="tel-divider" />
        <div className="tel-item" data-tooltip={`SYSTEM TELEMETRY (${telemetry.gpu})`}>
          <Zap size={12} className="text-accent" />
          <span className="tel-label">GPU:</span> {telemetry.gpu}
        </div>
      </div>

      <div className="tel-brand">
        <div className="status-indicator online" />
        <span className="tel-status-text">Cosmo v1.4.14</span>
      </div>
      
      <ClockDisplay />
    </div>
  );
}

