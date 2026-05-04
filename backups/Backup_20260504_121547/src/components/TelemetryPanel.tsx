import { ClockDisplay } from './ClockDisplay';
import type { TelemetryData } from '../types';

interface TelemetryPanelProps {
  videosCount: number;
  telemetry: TelemetryData;
}

export function TelemetryPanel({ videosCount, telemetry }: TelemetryPanelProps) {
  return (
    <div className="telemetry">
      <div className="tel-item"><span className="tel-label">VIDEOS:</span> {videosCount}</div>
      <div className="tel-item"><span className="tel-label">CPU:</span> {telemetry.cpu}</div>
      <div className="tel-item"><span className="tel-label">MEM:</span> {telemetry.mem}</div>
      <div className="tel-item"><span className="tel-label">GPU:</span> {telemetry.gpu}</div>
      <div className="tel-item" style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 'auto', paddingRight: '20px' }}>
        SYMPHONY v3.2.5
      </div>
      <ClockDisplay />
    </div>
  );
}
