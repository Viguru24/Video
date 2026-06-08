import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { TelemetryPanel } from './TelemetryPanel';

interface TelemetrySystemProps {
  videosCount: number;
  isPopout: boolean;
}

export function TelemetrySystem({ videosCount, isPopout }: TelemetrySystemProps) {
  const telemetry = useTelemetry(isPopout);

  return <TelemetryPanel videosCount={videosCount} telemetry={telemetry} />;
}
