import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Film, Loader2, Music, CheckCircle2, Terminal, Save, ArrowRight, Trash2, AlertTriangle, RotateCw } from 'lucide-react';

interface SymphonyWorkshopProps {
  onClose: () => void;
  addLog: (msg: string) => void;
}

type ProductionStep = 'idle' | 'generating_script' | 'composing_music' | 'rendering_video' | 'complete';

export function SymphonyWorkshop({ onClose, addLog }: SymphonyWorkshopProps) {
  // Persistence Hooks
  const [prompt, setPrompt] = useState(() => localStorage.getItem('symphony_prompt') || '');
  const [script, setScript] = useState<any>(() => {
    const saved = localStorage.getItem('symphony_script');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [productionStep, setProductionStep] = useState<ProductionStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [productionMetadata, setProductionMetadata] = useState({
    name: '',
    version: '1.0',
    notes: '',
    seed: Math.floor(Math.random() * 1000000).toString()
  });
  const [projectName, setProjectName] = useState('New Project');
  const [musicPrompt, setMusicPrompt] = useState(() => localStorage.getItem('symphony_music_prompt') || '');
  const [lastGeneratedFile, setLastGeneratedFile] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [renders, setRenders] = useState<any[]>([]);
  const [renderMode, setRenderMode] = useState<'remotion' | 'hyperframes'>('remotion');

  const internalLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    addLog(msg);
  };

  const API_BASE = 'http://localhost:8000';

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('symphony_prompt', prompt);
    localStorage.setItem('symphony_project_name', projectName);
    localStorage.setItem('symphony_music_prompt', musicPrompt);
  }, [prompt, projectName, musicPrompt]);

  useEffect(() => {
    if (script) localStorage.setItem('symphony_script', JSON.stringify(script));
    else localStorage.removeItem('symphony_script');
  }, [script]);

  const refreshProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/list_projects`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  };

  const refreshRenders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/list_renders`);
      const data = await res.json();
      setRenders(data.renders || []);
    } catch (e) {
      console.error("Failed to load renders", e);
    }
  };

  useEffect(() => {
    refreshProjects();
    refreshRenders();
  }, []);

  const handleSaveProject = async () => {
    const projectData = {
      id: Date.now().toString(),
      name: projectName,
      prompt,
      music_prompt: musicPrompt,
      script
    };

    try {
      await fetch(`${API_BASE}/api/save_project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
      refreshProjects();
      return true;
    } catch (e) {
      internalLog(`Save Failed: ${e}`);
      return false;
    }
  };

  const loadProject = (p: any) => {
    setProjectName(p.name);
    setPrompt(p.prompt);
    setMusicPrompt(p.music_prompt || '');
    setScript(p.script);
    setShowLibrary(false);

    const projectRenders = renders.filter(r => r.name.toLowerCase().startsWith(p.name.toLowerCase()));
    let maxVer = 1.0;
    projectRenders.forEach(r => {
      const match = r.name.match(/v(\d+(\.\d+)?)/i);
      if (match) {
        const v = parseFloat(match[1]);
        if (v >= maxVer) maxVer = Math.floor(v) + 1.0;
      }
    });

    setProductionMetadata(prev => ({
      ...prev,
      name: `${p.name} - v${maxVer.toFixed(1)}`,
      version: maxVer.toFixed(1)
    }));

    internalLog(`Switched: ${p.name} (Auto-Version: ${maxVer.toFixed(1)})`);
  };
  
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Permanently delete this project definition?')) return;
    try {
      await fetch(`${API_BASE}/api/delete_project/${id}`, { method: 'DELETE' });
      internalLog(`Project Deleted.`);
      refreshProjects();
    } catch (e) {
      console.error(e);
    }
  };
  
  const handleDeleteAllProjects = async () => {
    if (!confirm('CRITICAL: Purge ALL project definitions? This cannot be undone.')) return;
    try {
      await fetch(`${API_BASE}/api/delete_all_projects`, { method: 'DELETE' });
      internalLog(`Library Purged.`);
      refreshProjects();
    } catch (e) {
      console.error(e);
    }
  };

  const handleScanWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setIsScanning(true);
    internalLog(`Agent: Contacting COSMO Scraper for ${websiteUrl}...`);
    try {
      const res = await fetch(`${API_BASE}/api/scrape_website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl })
      });
      const data = await res.json();
      if (data.status === 'success') {
        const newPrompt = `Create a promotional video for this website:\nURL: ${websiteUrl}\n\nCore Hooks:\n${data.content}`;
        setPrompt(newPrompt);
        internalLog(`Agent: Website scan successful. Prompt updated with site data.`);
      } else {
        throw new Error(data.detail || 'Scan failed');
      }
    } catch (e: any) {
      internalLog(`Scan Failed: ${e.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!prompt.trim()) return;
    setProductionStep('generating_script');
    setError(null);
    internalLog(`Groq Agent: Reasoning about "${prompt}"...`);

    try {
      const res = await fetch(`${API_BASE}/api/generate_script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt + `\n\n[RANDOM_VARIATION_SEED: ${productionMetadata.seed}]`, 
          music_prompt: musicPrompt 
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setScript(data.script);
      setMusicPrompt(data.script.music_prompt || 'Upbeat tech background');
      internalLog(`Groq Agent: Script successfully drafted (Seed: ${productionMetadata.seed}).`);
    } catch (e: any) {
      setError(e.message);
      internalLog(`Error: ${e.message}`);
    } finally {
      setProductionStep('idle');
    }
  };

  const handleProduce = async () => {
    if (!script) {
      const msg = "CRITICAL: No script generated. Click 'GENERATE PLAN' first.";
      internalLog(msg);
      alert(msg);
      return;
    }
    
    const nextVer = (parseFloat(productionMetadata.version) + 0.1).toFixed(1);
    const updatedMetadata = {
      ...productionMetadata,
      version: nextVer,
      name: `${projectName} - v${nextVer}`
    };
    setProductionMetadata(updatedMetadata);

    internalLog(`Agent: Archiving project state [${projectName}] to database...`);
    await handleSaveProject();

    setProductionStep('composing_music');
    setError(null);
    internalLog(`Agent: Production Pipeline initialized for ${updatedMetadata.name}...`);

    try {
      const finalScript = { ...script, music_prompt: musicPrompt };
      
      const res = await fetch(`${API_BASE}/api/render_video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          script: finalScript, 
          name: projectName,
          production_name: updatedMetadata.name,
          version: updatedMetadata.version,
          notes: updatedMetadata.notes,
          seed: updatedMetadata.seed,
          mode: renderMode
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        internalLog(`Production Error: ${errorText}`);
        throw new Error(errorText);
      }

      const data = await res.json();
      setLastGeneratedFile(data.file);
      await refreshRenders();
      await refreshProjects();
      
      setProductionStep('complete');
      internalLog(`Agent: SUCCESS! Production Complete: ${data.file}`);
      setShowPreview(true);
    } catch (e: any) {
      internalLog(`Production Failed: ${e.message}`);
      setProductionStep('idle');
      setError(e.message);
    }
  };

  const handleOpenRender = async () => {
    try {
      await fetch(`${API_BASE}/api/open_render`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const renderPipeline = () => {
    const steps = [
      { id: 'generating_script', label: 'Scripting', icon: <Terminal size={14} /> },
      { id: 'composing_music', label: 'ACE Music', icon: <Music size={14} /> },
      { id: 'rendering_video', label: 'Rendering', icon: <Film size={14} /> },
    ];

    return (
      <div className="pipeline-track" style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(var(--accent-rgb), 0.1)' }}>
        {steps.map((step, idx) => {
          const isActive = productionStep === step.id;
          const isDone = productionStep === 'complete' || (productionStep === 'composing_music' && idx === 0) || (productionStep === 'rendering_video' && idx < 2);
          
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isActive || isDone ? 1 : 0.4 }}>
              <div style={{ 
                width: '24px', height: '24px', borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'var(--accent)' : isActive ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(255,255,255,0.1)',
                color: isDone ? '#000' : 'inherit',
                border: isActive ? '1px solid var(--accent)' : 'none'
              }}>
                {isDone ? <CheckCircle2 size={14} /> : step.icon}
              </div>
              <span style={{ fontSize: '12px', fontWeight: isActive ? 'bold' : 'normal', color: isActive ? 'var(--accent)' : '#fff' }}>
                {step.label}
              </span>
              {idx < steps.length - 1 && <div style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.1)' }} />}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="promo-overlay" style={{ 
      position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', 
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', padding: '20px'
    }}>
      <motion.div 
        className="promo-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ 
          width: isFullscreen ? '100vw' : '1000px', 
          height: isFullscreen ? '100vh' : 'auto',
          maxWidth: '100vw', maxHeight: isFullscreen ? '100vh' : '92vh',
          display: 'flex', flexDirection: 'column',
          border: isFullscreen ? 'none' : '1px solid rgba(var(--accent-rgb), 0.3)', 
          boxShadow: '0 50px 100px rgba(0,0,0,0.9), 0 0 30px rgba(var(--accent-rgb), 0.1)',
          background: 'var(--bg-surface)', overflow: 'hidden',
          borderRadius: isFullscreen ? '0' : '12px', transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div className="promo-header" style={{ 
          padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', height: '60px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Sparkles size={20} className="text-accent" style={{ filter: 'drop-shadow(0 0 5px var(--accent))' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <input 
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                style={{ 
                  background: 'transparent', border: 'none', color: '#fff', 
                  fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', 
                  letterSpacing: '2px', outline: 'none', width: 'auto', minWidth: '150px'
                }}
                placeholder="PROJECT NAME"
              />
              <div style={{ fontSize: '9px', opacity: 0.5, letterSpacing: '1px', fontWeight: '700' }}>COSMO SYMPHONY v3.2.5 - SOVEREIGN</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ 
              padding: '2px 8px', borderRadius: '4px', background: 'rgba(var(--accent-rgb), 0.1)', 
              border: '1px solid rgba(var(--accent-rgb), 0.3)', color: 'var(--accent)', 
              fontSize: '9px', fontWeight: '800', letterSpacing: '1px' 
            }}>
              LOCAL GPU
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '900', letterSpacing: '1px' }}>
                {productionStep !== 'idle' ? `STATUS: ${productionStep.toUpperCase()}` : 'SYSTEM READY'}
              </div>
              <div style={{ fontSize: '9px', opacity: 0.5, fontWeight: '700' }}>
                ACTIVE VERSION: v{productionMetadata.version}
              </div>
            </div>
            
            <div className="window-controls" style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
              <div onClick={onClose} className="workshop-close yellow" title="Minimize" />
              <div onClick={() => setIsFullscreen(!isFullscreen)} className="workshop-close green" title="Fullscreen" />
              <div onClick={onClose} className="workshop-close red" title="Close" />
            </div>
          </div>
        </div>

        <div style={{ 
          padding: '8px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '10px', marginRight: 'auto' }}>
            <button 
              onClick={() => { refreshProjects(); refreshRenders(); }}
              style={{ 
                height: '34px', padding: '0 12px', borderRadius: '8px', 
                background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: '10px', fontWeight: '900', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s'
              }}
            >
              <RotateCw size={12} /> FORCE SYNC
            </button>

            <button 
              onClick={handleSaveProject}
              style={{ 
                height: '34px', padding: '0 16px', borderRadius: '8px', 
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s'
              }}
            >
              <Save size={14} /> SAVE TO LIBRARY ({projects.length})
            </button>

            <button 
              onClick={handleGenerateScript}
              disabled={productionStep !== 'idle' || !prompt.trim()}
              style={{ 
                height: '34px', padding: '0 16px', borderRadius: '8px', 
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', opacity: prompt.trim() ? 1 : 0.5, transition: '0.2s'
              }}
            >
              <Sparkles size={14} /> GENERATE PLAN
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
              <button 
                onClick={() => setRenderMode('remotion')}
                style={{ 
                  flex: 1, padding: '4px 8px', borderRadius: '4px', 
                  background: renderMode === 'remotion' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  border: renderMode === 'remotion' ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                  color: renderMode === 'remotion' ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                  fontSize: '9px', fontWeight: '800', cursor: 'pointer'
                }}
              >
                SMART LAYOUT
              </button>
              <button 
                onClick={() => setRenderMode('hyperframes')}
                style={{ 
                  flex: 1, padding: '4px 8px', borderRadius: '4px', 
                  background: renderMode === 'hyperframes' ? 'rgba(139,92,246,0.1)' : 'transparent',
                  border: renderMode === 'hyperframes' ? '1px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                  color: renderMode === 'hyperframes' ? '#8B5CF6' : 'rgba(255,255,255,0.4)',
                  fontSize: '9px', fontWeight: '800', cursor: 'pointer'
                }}
              >
                CINEMATIC PRO
              </button>
            </div>

            <button 
              onClick={() => {
                if (productionStep !== 'idle') return;
                const projectRenders = renders.filter(r => r.name.toLowerCase().startsWith(projectName.toLowerCase()));
                let maxVer = 1.0;
                projectRenders.forEach(r => {
                  const match = r.name.match(/v(\d+(\.\d+)?)/i);
                  if (match) {
                    const v = parseFloat(match[1]);
                    if (v >= maxVer) maxVer = Math.floor(v) + 1.0;
                  }
                });
                setProductionMetadata({ 
                  ...productionMetadata, 
                  name: `${projectName} - v${maxVer.toFixed(1)}`,
                  version: maxVer.toFixed(1)
                });
                setShowProductionForm(true);
              }}
              disabled={(!script && renderMode === 'remotion') || productionStep !== 'idle'}
              style={{ 
                padding: '10px 25px', borderRadius: '8px', 
                background: productionStep === 'idle' ? (renderMode === 'hyperframes' ? '#8B5CF6' : 'var(--accent)') : 'rgba(255,255,255,0.1)',
                color: productionStep === 'idle' ? '#000' : 'rgba(255,255,255,0.3)',
                fontSize: '12px', fontWeight: '900', letterSpacing: '1px',
                cursor: productionStep === 'idle' ? 'pointer' : 'default', border: 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
                boxShadow: productionStep === 'idle' ? `0 4px 15px ${renderMode === 'hyperframes' ? 'rgba(139,92,246,0.3)' : 'rgba(0,255,204,0.3)'}` : 'none'
              }}
            >
              {productionStep === 'idle' ? (
                <>START {renderMode === 'hyperframes' ? 'PREMIUM' : ''} PRODUCTION <ArrowRight size={16} /></>
              ) : (
                <>RENDERING... <Loader2 size={16} className="spin" /></>
              )}
            </button>
          </div>
        </div>

        <div className="promo-workshop-body" style={{ 
          flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', 
          padding: '24px', overflowY: 'auto', scrollbarWidth: 'thin'
        }}>
          {renderPipeline()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                  <Terminal size={12} /> Video Vision (Prompt)
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                  <input 
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://your-website.com"
                    style={{ 
                      flex: 1, padding: '8px 12px', borderRadius: '6px', 
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '12px', outline: 'none'
                    }}
                  />
                  <button onClick={handleScanWebsite} disabled={isScanning || !websiteUrl} className="hdr-btn" style={{ fontSize: '10px' }}>
                    {isScanning ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} SCAN WEBSITE
                  </button>
                </div>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video vision..."
                  style={{ 
                    height: '140px', padding: '15px', borderRadius: '8px', 
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: '13px', fontFamily: 'monospace', resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                  <Music size={12} /> Soundtrack (Auto-Generated)
                </div>
                <textarea 
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  style={{ 
                    height: '80px', padding: '15px', borderRadius: '8px', 
                    background: 'rgba(var(--accent-rgb), 0.05)', border: '1px solid rgba(var(--accent-rgb), 0.2)',
                    color: '#fff', fontSize: '13px', fontFamily: 'monospace', resize: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                <Terminal size={12} /> Production Log
              </div>
              <div style={{ 
                flex: 1, padding: '15px', borderRadius: '8px', background: '#000', 
                border: '1px solid rgba(255,255,255,0.05)', color: 'var(--accent)', 
                fontSize: '12px', fontFamily: 'monospace', overflowY: 'auto'
              }}>
                {logs.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showProductionForm && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ width: '450px', background: '#1a1f26', padding: '30px', borderRadius: '12px', border: '1px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '900', color: 'var(--accent)' }}>PRODUCTION MANIFEST</h3>
                <button onClick={() => setShowProductionForm(false)} className="premium-close-btn"><X size={16} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input value={productionMetadata.name} onChange={e => setProductionMetadata({...productionMetadata, name: e.target.value})} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px' }} placeholder="Production Name" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <input value={productionMetadata.version} onChange={e => setProductionMetadata({...productionMetadata, version: e.target.value})} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px' }} placeholder="Version" />
                  <input value={productionMetadata.seed} onChange={e => setProductionMetadata({...productionMetadata, seed: e.target.value})} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px' }} placeholder="Seed" />
                </div>
                <textarea value={productionMetadata.notes} onChange={e => setProductionMetadata({...productionMetadata, notes: e.target.value})} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px', height: '80px' }} placeholder="Director Notes..." />
                <button onClick={handleProduce} style={{ padding: '14px', borderRadius: '6px', background: 'var(--accent)', color: '#000', fontWeight: '900', border: 'none' }}>CONFIRM & RENDER</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreview && lastGeneratedFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 20, right: 20 }}>
              <button onClick={() => setShowPreview(false)} className="premium-close-btn"><X size={18} /></button>
            </div>
            <video src={`${API_BASE}/api/renders/${lastGeneratedFile}`} autoPlay controls style={{ maxWidth: '85vw', maxHeight: '75vh', borderRadius: '8px', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
