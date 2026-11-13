import React from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Wifi,
  X
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const CLOUD_APK_DOWNLOAD_URL =
  'https://api.cosmowhisper.com/updates/cosmo-companion/app-latest.apk?token=cosmo-companion-ota';

interface WifiShareHeaderProps {
  receiverConnected: boolean;
  onClose: () => void;
}

export const WifiShareHeader: React.FC<WifiShareHeaderProps> = ({ receiverConnected, onClose }) => (
  <div style={{
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255, 255, 255, 0.02)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '26px',
        height: '26px',
        borderRadius: '7px',
        background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.2), rgba(0, 255, 136, 0.2))',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Wifi size={14} style={{ color: '#00ff88' }} />
      </div>
      <div>
        <h2 style={{ fontSize: '12.5px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0 }}>
          Wi-Fi Share
        </h2>
        <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          Direct workspace sync with mobile
        </span>
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 7px',
        borderRadius: '10px',
        background: receiverConnected ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${receiverConnected ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
        fontSize: '9px',
        fontWeight: 700,
        color: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.5)'
      }}>
        <span style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: receiverConnected ? '#00ff88' : 'rgba(255, 255, 255, 0.4)'
        }} />
        <span>{receiverConnected ? 'Phone Connected' : 'Waiting for Phone'}</span>
      </div>

      <button
        onClick={onClose}
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.7)',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s'
        }}
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  </div>
);

interface WifiShareConnectionCardProps {
  qrDataUrl: string;
  shareUrl: string;
  pairingToken: string;
  copied: boolean;
  tokenCopied: boolean;
  onCopyLink: () => void;
  onCopyToken: () => void;
}

export const WifiShareConnectionCard: React.FC<WifiShareConnectionCardProps> = ({
  qrDataUrl,
  shareUrl,
  pairingToken,
  copied,
  tokenCopied,
  onCopyLink,
  onCopyToken
}) => (
  <div style={{
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.35)',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 255, 255, 0.08)'
  }}>
    {qrDataUrl && (
      <div style={{
        background: '#ffffff',
        padding: '3px',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        flexShrink: 0
      }}>
        <img src={qrDataUrl} alt="Scan QR Code" style={{ width: '60px', height: '60px', display: 'block' }} />
      </div>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
          Scan QR or open on phone:
        </span>
        <a
          href={`http://${window.location.hostname || '127.0.0.1'}:48273/CosmoShare.apk`}
          download="CosmoShare.apk"
          style={{
            fontSize: '8px',
            fontWeight: 800,
            color: '#00ff88',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid rgba(0, 255, 136, 0.25)',
            padding: '1px 5px',
            borderRadius: '4px'
          }}
          title="Download Companion APK from Local Studio PC"
        >
          <Smartphone size={8} />
          <span>CosmoShare APK</span>
        </a>
        <a
          href={CLOUD_APK_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '8px',
            fontWeight: 800,
            color: '#00d2ff',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'rgba(0, 210, 255, 0.1)',
            border: '1px solid rgba(0, 210, 255, 0.25)',
            padding: '1px 5px',
            borderRadius: '4px'
          }}
          title="Download Latest Companion APK from Sovereign Cloud VPS"
        >
          <ExternalLink size={8} />
          <span>Cloud APK</span>
        </a>
      </div>

      <div
        onClick={onCopyLink}
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '5px',
          padding: '2px 7px',
          fontSize: '10px',
          fontWeight: 700,
          color: '#00d2ff',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer'
        }}
        title="Click to copy URL"
      >
        {shareUrl}
      </div>

      <div style={{ display: 'flex', gap: '5px', marginTop: '1px', alignItems: 'center' }}>
        <button
          onClick={onCopyLink}
          style={{
            background: copied ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.07)',
            border: `1px solid ${copied ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.12)'}`,
            color: copied ? '#00ff88' : '#ffffff',
            borderRadius: '5px',
            padding: '2px 7px',
            fontSize: '9px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            whiteSpace: 'nowrap'
          }}
        >
          {copied ? <Check size={9} /> : <Copy size={9} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        <button
          onClick={async () => {
            try {
              await invoke('open_external_url', { url: shareUrl });
            } catch (err) {
              console.error('Failed to open link:', err);
            }
          }}
          style={{
            background: 'rgba(0, 210, 255, 0.12)',
            border: '1px solid rgba(0, 210, 255, 0.3)',
            color: '#00d2ff',
            borderRadius: '5px',
            padding: '2px 7px',
            fontSize: '9px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            whiteSpace: 'nowrap'
          }}
          title="Open share page in your browser"
        >
          <ExternalLink size={9} />
          <span>Open</span>
        </button>

        {pairingToken && (
          <button
            onClick={onCopyToken}
            style={{
              background: tokenCopied ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.07)',
              border: `1px solid ${tokenCopied ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.12)'}`,
              color: tokenCopied ? '#00ff88' : 'rgba(255,255,255,0.85)',
              borderRadius: '5px',
              padding: '2px 7px',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              whiteSpace: 'nowrap'
            }}
            title={`Pairing Token: ${pairingToken} (Click to copy for manual app entry)`}
          >
            <ShieldCheck size={9} />
            <span>{tokenCopied ? 'Token Copied' : `PIN: ${pairingToken.slice(0, 8)}...`}</span>
          </button>
        )}
      </div>
    </div>
  </div>
);
