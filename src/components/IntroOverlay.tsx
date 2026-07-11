import { useState, useEffect } from 'react';

interface IntroOverlayProps {
  isPopout: boolean;
}

export function IntroOverlay({ isPopout }: IntroOverlayProps) {
  const [showIntro, setShowIntro] = useState(!isPopout);
  const [introStep, setIntroStep] = useState<'whisper' | 'expand' | 'complete'>('whisper');

  useEffect(() => {
    if (isPopout) {
      setIntroStep('complete');
      setShowIntro(false);
      return;
    }

    // Play warm sci-fi rising startup sound
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        
        // Root oscillator (Sine for deep clean sub-bass)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(90, now);
        osc1.frequency.exponentialRampToValueAtTime(360, now + 2.0); // Sweep upwards
        
        // Harmonic oscillator (Triangle for rich warm texture)
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(180, now);
        osc2.frequency.exponentialRampToValueAtTime(720, now + 2.0);
        
        // High harmonic sparkle (Sine detuned)
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(360, now);
        osc3.frequency.exponentialRampToValueAtTime(1440, now + 2.0);

        // Lowpass filter sweep to give it that cinematic build-up feel
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2, now);
        filter.frequency.setValueAtTime(150, now);
        filter.frequency.exponentialRampToValueAtTime(3000, now + 1.8);

        // Gain (volume) envelope
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.4); // quick fade in
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.8); // slow decay

        osc1.connect(filter);
        osc2.connect(filter);
        osc3.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);

        osc1.stop(now + 3.0);
        osc2.stop(now + 3.0);
        osc3.stop(now + 3.0);
      }
    } catch (e) {
      console.warn('Startup sound audio context blocked or unsupported:', e);
    }
    
    // Step 1: Whisper for 2.2 seconds
    const t1 = setTimeout(() => {
      setIntroStep('expand');
    }, 2200);
    
    // Step 2: Expand for 1.3 seconds, then complete
    const t2 = setTimeout(() => {
      setIntroStep('complete');
      setTimeout(() => {
        setShowIntro(false);
      }, 800);
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPopout]);

  if (!showIntro) return null;

  return (
    <div className={`cosmo-intro-overlay ${introStep === 'complete' ? 'fadeout' : ''}`}>
      <div className={`intro-glow-bg ${introStep !== 'whisper' ? 'expanded' : ''}`} />
      <div className={`intro-logo-content ${introStep !== 'whisper' ? 'expanded' : ''}`}>
        <span className="intro-title-text">COSMO</span>
        <span className="intro-subtitle-text">SYMPHONY</span>
      </div>
    </div>
  );
}

interface ShutdownOverlayProps {
  show: boolean;
}

export function ShutdownOverlay({ show }: ShutdownOverlayProps) {
  if (!show) return null;

  return (
    <div className="cosmo-intro-overlay shutdown">
      <div className="intro-glow-bg expanded shutdown" />
      <div className="intro-logo-content expanded shutdown">
        <span className="intro-title-text shutdown">COSMO</span>
        <span className="intro-subtitle-text shutdown">SYMPHONY</span>
        <div className="shutdown-text">
          Thank you for using Cosmos Symphony
        </div>
      </div>
    </div>
  );
}
