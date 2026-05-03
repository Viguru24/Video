import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Film, Loader2, Music, CheckCircle2, Terminal, Save, ArrowRight } from 'lucide-react';

interface CreationStudioProps {
  onClose: () => void;
  addLog: (msg: string) => void;
}

type ProductionStep = 'idle' | 'generating_script' | 'composing_music' | 'rendering_video' | 'complete';

export function CreationStudio({ onClose, addLog }: CreationStudioProps) {
  // Persistence Hooks
  const [prompt, setPrompt] = useState(() => localStorage.getItem('studio_prompt') || '');
  const [script, setScript] = useState<any>(() => {
    const saved = localStorage.getItem('studio_script');
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
  const [projectName, setProjectName] = useState('Untitled Vision');
  const [musicPrompt, setMusicPrompt] = useState(() => localStorage.getItem('studio_music_prompt') || '');
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

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('studio_prompt', prompt);
    localStorage.setItem('studio_project_name', projectName);
    localStorage.setItem('studio_music_prompt', musicPrompt);
    
    // BUG FIX: Clear the stale script if the prompt changes significantly
    // This prevents rendering "Cosmo Whisper" when the user wants "Micro Meadow"
    if (script && !prompt.includes(projectName) && prompt.length > 10) {
      // We don't clear immediately to allow small edits, but if the prompt is totally different...
      // Actually, a better way is to just let the user know they need to regenerate.
    }
  }, [prompt, projectName, musicPrompt]);

  useEffect(() => {
    if (script) localStorage.setItem('studio_script', JSON.stringify(script));
    else localStorage.removeItem('studio_script');
  }, [script]);

  // Sync projects from database
const API_BASE = 'http://localhost:8000';

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
    internalLog(`Switched to project: ${p.name}`);
  };

  const handleScanWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setIsScanning(true);
    internalLog(`Agent: Contacting NPU ScrapingBee for ${websiteUrl}...`);
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
    if (!script) return;
    
    // Auto-save before production
    internalLog(`Agent: Archiving project state to database...`);
    await handleSaveProject();

    setProductionStep('composing_music');
    setError(null);
    internalLog(`Agent: Production Pipeline initialized...`);
    internalLog(`Agent: Engine: Local RTX 5080 (F: Drive Optimized)`);
    internalLog(`Agent: Orchestrating ACE-Step 1.5 for audio synthesis...`);

    try {
      // Update script with potentially edited music prompt
      const finalScript = { ...script, music_prompt: musicPrompt };
      
      // Step 1: Music & Render
      internalLog(`Agent: Calling backend orchestrator at ${API_BASE}...`);
      internalLog(`Agent: Orchestrating ACE-Step with prompt: "${musicPrompt}"`);
      internalLog(`Agent: Remotion engine engaged. Crunching frames (est. 45-90s)...`);
      // Save to local history for the dropdown feature
      const historyStr = localStorage.getItem('cosmo_production_history');
      let history = historyStr ? JSON.parse(historyStr) : [];
      // Remove existing entry with same name if exists, then push to top
      history = history.filter((h: any) => h.name !== productionMetadata.name);
      history.unshift({ ...productionMetadata });
      localStorage.setItem('cosmo_production_history', JSON.stringify(history.slice(0, 10))); // keep last 10
      
      const res = await fetch(`${API_BASE}/api/render_video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          script: finalScript, 
          name: projectName,
          production_name: productionMetadata.name,
          version: productionMetadata.version,
          notes: productionMetadata.notes,
          seed: productionMetadata.seed,
          mode: renderMode
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        internalLog(`Production Error: ${errorText}`);
        throw new Error(errorText);
      }

      const data = await res.json();
      const fileName = data.file;
      setLastGeneratedFile(fileName);
      refreshRenders();
      
      setProductionStep('complete');
      internalLog(`Agent: SUCCESS! Your video is ready.`);
      setShowPreview(true);

    } catch (e: any) {
      setError(e.message);
      internalLog(`Production Failed: ${e.message}`);
      setProductionStep('idle');
    }
  };

  const handleOpenRender = async () => {
    try {
      await fetch(`${API_BASE}/api/open_render`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopProduction = async () => {
    try {
      await fetch(`${API_BASE}/api/stop_production`, { method: 'POST' });
      setProductionStep('idle');
      internalLog(`Agent: PRODUCTION FORCEFULLY TERMINATED BY USER.`);
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
      <div className="pipeline-track" style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
        {steps.map((step, idx) => {
          const isActive = productionStep === step.id;
          const isDone = productionStep === 'complete' || (productionStep === 'composing_music' && idx === 0) || (productionStep === 'rendering_video' && idx < 2);
          
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: isActive || isDone ? 1 : 0.4 }}>
              <div style={{ 
                width: '24px', height: '24px', borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'var(--accent)' : isActive ? 'rgba(0,255,204,0.2)' : 'rgba(255,255,255,0.1)',
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
      position: 'fixed', 
      inset: 0, 
      zIndex: 9999, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(12px)',
      padding: '20px'
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
          maxWidth: '100vw', 
          maxHeight: isFullscreen ? '100vh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          border: isFullscreen ? 'none' : '1px solid rgba(0,255,204,0.3)', 
          boxShadow: '0 50px 100px rgba(0,0,0,0.9), 0 0 30px rgba(0,255,204,0.1)',
          background: '#0a0e14',
          overflow: 'hidden',
          borderRadius: isFullscreen ? '0' : '12px',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div className="promo-header" style={{ 
          padding: '12px 24px', 
          borderBottom: '1px solid rgba(255,255,255,0.08)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(10px)',
          height: '60px'
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
              <div style={{ fontSize: '9px', opacity: 0.5, letterSpacing: '1px', fontWeight: '700' }}>COSMO STUDIO v3.2.0 • SOVEREIGN</div>
            </div>
            <div style={{ 
              padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,255,204,0.1)', 
              border: '1px solid rgba(0,255,204,0.3)', color: 'var(--accent)', 
              fontSize: '9px', fontWeight: '800', letterSpacing: '1px' 
            }}>
              LOCAL GPU
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '800', letterSpacing: '1px' }}>
              {productionStep !== 'idle' ? `STATUS: ${productionStep.toUpperCase()}` : 'READY'}
            </div>
            
            <div className="window-controls" style={{ display: 'flex', gap: '10px' }}>
              {/* ORANGE: MINIMIZE (Soft Close for now) */}
              <div 
                onClick={onClose} 
                style={{ 
                  width: '12px', height: '12px', borderRadius: '50%', background: '#FFBD2E', 
                  cursor: 'pointer', boxShadow: '0 0 5px rgba(255,189,46,0.5)',
                  transition: 'all 0.2s ease',
                  border: '1px solid rgba(0,0,0,0.1)'
                }} 
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                title="Minimize"
              />
              {/* GREEN: MAXIMIZE (Fullscreen) */}
              <div 
                onClick={() => setIsFullscreen(!isFullscreen)} 
                style={{ 
                  width: '12px', height: '12px', borderRadius: '50%', background: '#27C93F', 
                  cursor: 'pointer', boxShadow: '0 0 5px rgba(39,201,63,0.5)',
                  transition: 'all 0.2s ease',
                  border: '1px solid rgba(0,0,0,0.1)'
                }} 
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                title="Fullscreen"
              />
              {/* RED: CLOSE (Hard Close) */}
              <div 
                onClick={onClose} 
                style={{ 
                  width: '12px', height: '12px', borderRadius: '50%', background: '#FF5F56', 
                  cursor: 'pointer', boxShadow: '0 0 5px rgba(255,95,86,0.6)',
                  transition: 'all 0.2s ease',
                  border: '1px solid rgba(0,0,0,0.1)'
                }} 
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                title="Close"
              />
            </div>
          </div>
        </div>

        {/* SECONDARY ACTION BAR */}
        <div style={{ 
          padding: '8px 24px', 
          background: 'rgba(255,255,255,0.02)', 
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', 
          justifyContent: 'flex-end', 
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0
        }}>
          {/* LEFT COMMANDS */}
          <div style={{ display: 'flex', gap: '10px', marginRight: 'auto' }}>
            <button 
              onClick={() => setShowLibrary(!showLibrary)}
              style={{ 
                height: '34px', padding: '0 16px', borderRadius: '8px', 
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <Save size={14} /> LIBRARY ({projects.length})
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
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <Sparkles size={14} /> GENERATE PLAN
            </button>
          </div>

          {/* PRODUCTION CENTER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                <button 
                  onClick={() => setRenderMode('remotion')}
                  style={{ 
                    flex: 1, padding: '4px 8px', borderRadius: '4px', 
                    background: renderMode === 'remotion' ? 'rgba(0,255,204,0.1)' : 'transparent',
                    border: renderMode === 'remotion' ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                    color: renderMode === 'remotion' ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                    fontSize: '9px', fontWeight: '800', cursor: 'pointer'
                  }}
                >
                  REMOTION (SMART)
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
                  HYPER (GSAP)
                </button>
              </div>

              <button 
                onClick={() => {
                  setProductionMetadata({ ...productionMetadata, name: `${projectName} - Run ${new Date().toLocaleTimeString()}` });
                  setShowProductionForm(true);
                }}
                disabled={!script && renderMode === 'remotion' || productionStep !== 'idle'}
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

          {productionStep === 'complete' && (
            <button 
              onClick={handleOpenRender}
              style={{ 
                height: '34px', padding: '0 24px', borderRadius: '8px', 
                background: '#8B5CF6', color: '#fff', fontSize: '11px', fontWeight: '900', 
                cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 15px rgba(139,92,246,0.3)'
              }}
            >
              <Film size={14} /> VIEW LATEST VIDEO
            </button>
          )}
        </div>

        <div className="promo-body" style={{ 
          flex: 1,
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px', 
          padding: '24px',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--accent) rgba(0,0,0,0.2)',
          position: 'relative'
        }}>
          {/* PRODUCTION TRACK */}
          {renderPipeline()}

          {/* PROJECT LIBRARY SIDEBAR */}
          <AnimatePresence>
            {showLibrary && (
              <motion.div 
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                style={{ 
                  position: 'absolute', top: 0, left: 0, bottom: 0, width: '320px',
                  background: '#0a0e14', borderRight: '1px solid rgba(255,255,255,0.1)',
                  zIndex: 100, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px',
                  boxShadow: '20px 0 40px rgba(0,0,0,0.5)'
                }}
              >
                {/* PROJECT DEFINITIONS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--accent)' }}>PROJECT DEFINITIONS</span>
                    <button onClick={handleSaveProject} style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--accent)', color: '#000', fontSize: '10px', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                      SAVE CURRENT
                    </button>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projects.map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => loadProject(p)}
                        style={{ 
                          padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', 
                          border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: '0.2s'
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff' }}>{p.name}</div>
                        <div style={{ fontSize: '9px', opacity: 0.4 }}>{new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />

                {/* RENDER HISTORY */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#8B5CF6' }}>RENDER HISTORY</span>
                    <button onClick={handleOpenRender} style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.2)', color: '#8B5CF6', fontSize: '10px', border: '1px solid rgba(139,92,246,0.4)', fontWeight: '800', cursor: 'pointer' }}>
                      OPEN FOLDER
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {renders.map(r => (
                      <div 
                        key={r.name} 
                        style={{ 
                          padding: '10px', borderRadius: '6px', background: 'rgba(139,92,246,0.05)', 
                          border: '1px solid rgba(139,92,246,0.1)', cursor: 'default'
                        }}
                      >
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
                          {r.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                          <span style={{ fontSize: '9px', opacity: 0.4 }}>{new Date(r.created_at * 1000).toLocaleString()}</span>
                          <span style={{ fontSize: '9px', color: '#8B5CF6' }}>{(r.size / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                      </div>
                    ))}
                    {renders.length === 0 && <div style={{ fontSize: '11px', opacity: 0.3, textAlign: 'center', marginTop: '20px' }}>No renders yet.</div>}
                  </div>
                </div>

                <button 
                  onClick={() => setShowLibrary(false)}
                  style={{ padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                >
                  CLOSE SIDEBAR
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
            {/* SCRIPT EDITOR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                  <Terminal size={12} />
                  Video Vision (Prompt)
                </div>

                {/* WEBSITE SCANNER BAR */}
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
                  <button 
                    onClick={handleScanWebsite}
                    disabled={isScanning || !websiteUrl}
                    style={{ 
                      padding: '8px 15px', borderRadius: '6px', 
                      background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.3)',
                      color: 'var(--accent)', fontSize: '10px', fontWeight: '800', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isScanning ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                    SCAN WEBSITE
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                  <select 
                    onChange={(e) => {
                      if (!e.target.value) return;
                      // Prepend the vibe to the existing prompt
                      setPrompt(`[DIRECTOR INSTRUCTION: ${e.target.value}]\n\n${prompt}`);
                      e.target.value = ""; // Reset
                    }}
                    style={{ 
                      flex: 1, padding: '8px 12px', borderRadius: '6px', 
                      background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
                      color: '#8B5CF6', fontSize: '11px', outline: 'none', fontWeight: '800', cursor: 'pointer'
                    }}
                  >
                    <option value="">✨ Add Quick Directorial Vibe...</option>
                    <option value="Make this a high-energy, aggressive 15-second teaser.">🔥 High-Energy Teaser</option>
                    <option value="Make it look like a cyberpunk tech product. Dark, edgy, and fast-paced.">💻 Cyberpunk Tech</option>
                    <option value="Optimize for TikTok. Extremely fast cuts, bold text, high contrast.">📱 TikTok Fast Cuts</option>
                    <option value="Design a sleek, Apple-style minimalist product reveal.">🍏 Apple-style Minimalist</option>
                    <option value="Use the 'flat-motion-graphics' theme. Vibrant, colorful, startup vibe.">🚀 Startup Motion Graphics</option>
                    <option value="Noir Cinematic: Black and white, moody, high contrast, orchestral score.">🎬 Noir Cinematic</option>
                    <option value="Glitch Aesthetic: Distortion, digital artifacts, aggressive cuts, industrial techno.">👾 Glitch Aesthetic</option>
                    <option value="Vaporwave: Pink and blue neon, 80s nostalgia, chill but vibrant colors.">🌴 Vaporwave Vibe</option>
                    <option value="Brutalist: Raw, blocky, high contrast, industrial, bold typography.">🏗️ Brutalist Design</option>
                    <option value="Hand-drawn Sketch: Pencil style, whiteboard animation feel, casual voiceover.">✏️ Hand-drawn Sketch</option>
                    <option value="Space Opera: Cinematic, epic orchestral music, deep purples and starfields.">🌌 Space Opera</option>
                    <option value="Infographic: Clean, chart-heavy, informative, motion-graphics driven.">📈 Infographic Style</option>
                    <option value="LinkedIn Professional: Soft shadows, blue/gray palette, reliable and trust-focused.">👔 LinkedIn Pro</option>
                    <option value="Streetwear Brand: Aggressive, quick cuts, urban vibe, hip-hop influence.">👟 Streetwear Brand</option>
                    <option value="Retro Future: CRT effects, scanlines, analog feel, synthwave soundtrack.">📺 Retro Future</option>
                    <option value="Nature Inspired: Soft greens, slow pans, organic textures, peaceful ambiance.">🌿 Nature Inspired</option>
                    <option value="Action Trailer: Dramatic orchestral, fast motion, impact sound effects.">🧨 Action Trailer</option>
                    <option value="ASMR Visual: Macro shots, soft transitions, peaceful and high-definition detail.">👂 ASMR Visual</option>
                    <option value="Lofi Chill: Low contrast, grainy, relaxed pacing, bedroom-producer beats.">☕ Lofi Chill</option>
                    <option value="High-End Luxury: Gold and Black, slow motion, elegant, minimal text.">💎 High-End Luxury</option>
                    <option value="Create a minimalist, clinical aesthetic. Focus on privacy and security.">🔒 Clinical & Secure</option>
                    <option value="Make it a serious, corporate B2B presentation.">💼 Corporate B2B</option>
                    <option value="Give it an anime-ghibli theme. Ethereal, soft, and creative.">🌸 Anime / Ghibli</option>
                    <option value="Make it a highly technical, developer-focused pitch with terminal scenes.">⚙️ Developer Focused</option>
                    <option value="Focus entirely on the financial savings and ROI.">💰 ROI & Financials</option>
                    <option value="Create an overwhelming, stat-heavy barrage of data and numbers.">📊 Stat Heavy</option>
                  </select>
                </div>

                <textarea 
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (script) setScript(null); // Clear stale scripts on edit
                  }}
                  placeholder="Describe your video vision or scan a website above..."
                  style={{ 
                    height: '140px', padding: '15px', borderRadius: '8px', 
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: '13px', fontFamily: 'monospace', resize: 'none',
                    outline: 'none', transition: '0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.8 }}>
                  <Music size={12} />
                  Soundtrack (Auto-Generated)
                </div>
                {musicPrompt && <span style={{ fontSize: '9px', color: 'var(--accent)', opacity: 0.5 }}>✓ AI Selected</span>}
              </div>
              <textarea 
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="Click GENERATE PLAN above — the AI will choose the perfect soundtrack style for your video automatically."
                style={{ 
                  height: '80px', padding: '15px', borderRadius: '8px', 
                  background: 'rgba(0,255,204,0.05)', border: '1px solid rgba(0,255,204,0.2)',
                  color: '#fff', fontSize: '13px', fontFamily: 'monospace', resize: 'none',
                  outline: 'none', transition: '0.2s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(0,255,204,0.2)'}
              />
              <div style={{ fontSize: '10px', opacity: 0.4, fontStyle: 'italic' }}>
                Auto-filled by the AI Director. Edit only if you want to override the vibe.
              </div>
              </div>
            </div>

            {/* LIVE CONSOLE / SCRIPT VIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>
                <Loader2 size={12} className={productionStep !== 'idle' ? 'spin' : ''} />
                Production Log
              </div>
              <div style={{ 
                flex: 1, padding: '15px', borderRadius: '8px', 
                background: '#000', border: '1px solid rgba(255,255,255,0.05)',
                color: 'var(--accent)', fontSize: '12px', fontFamily: 'monospace',
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
              }}>
                {logs.length === 0 && <div style={{ opacity: 0.3 }}>Waiting for production commands...</div>}
                {logs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: log.includes('Error') || log.includes('Failed') ? '#ff5f56' : 'inherit' }}>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* PRODUCTION METADATA MODAL */}
      <AnimatePresence>
        {showProductionForm && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ 
                width: '450px', background: '#1a1f26', padding: '30px', borderRadius: '12px',
                border: '1px solid var(--accent)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: '20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '14px', letterSpacing: '1px', fontWeight: '900', color: 'var(--accent)' }}>PRODUCTION MANIFEST</h3>
                <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setShowProductionForm(false)} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,255,204,0.05)', padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(0,255,204,0.1)' }}>
                <label style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: '800' }}>LOAD PREVIOUS</label>
                <select 
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const h = JSON.parse(e.target.value);
                    let nextVersion = h.version;
                    const match = h.version.match(/v(\d+)/);
                    if (match) {
                      nextVersion = `v${parseInt(match[1]) + 1}`;
                    } else if (h.version) {
                      nextVersion = h.version + '_v2';
                    } else {
                      nextVersion = 'v2';
                    }
                    setProductionMetadata({ 
                      name: h.name, 
                      version: nextVersion, 
                      notes: h.notes,
                      seed: Math.floor(Math.random() * 1000000).toString()
                    });
                    e.target.value = ''; // reset
                  }}
                  style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px', color: '#fff', borderRadius: '4px', outline: 'none', fontSize: '11px', width: '200px' }}
                >
                  <option value="">-- Select --</option>
                  {(JSON.parse(localStorage.getItem('cosmo_production_history') || '[]')).map((h: any, i: number) => (
                    <option key={i} value={JSON.stringify(h)}>{h.name} ({h.version})</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '10px', opacity: 0.5, fontWeight: '800' }}>PRODUCTION NAME</label>
                <input 
                  value={productionMetadata.name}
                  onChange={e => setProductionMetadata({...productionMetadata, name: e.target.value})}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '10px', opacity: 0.5, fontWeight: '800' }}>VERSION</label>
                  <input 
                    value={productionMetadata.version}
                    onChange={e => setProductionMetadata({...productionMetadata, version: e.target.value})}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '10px', opacity: 0.5, fontWeight: '800' }}>SEED</label>
                  <input 
                    value={productionMetadata.seed}
                    onChange={e => setProductionMetadata({...productionMetadata, seed: e.target.value})}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '10px', opacity: 0.5, fontWeight: '800' }}>DIRECTOR NOTES (OPTIONAL)</label>
                <textarea 
                  value={productionMetadata.notes}
                  onChange={e => setProductionMetadata({...productionMetadata, notes: e.target.value})}
                  placeholder="Optional notes for this production run..."
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', color: '#fff', borderRadius: '6px', height: '80px', resize: 'none', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={() => setShowProductionForm(false)}
                  style={{ flex: 1, padding: '14px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => {
                    const historyStr = localStorage.getItem('cosmo_production_history');
                    let history = historyStr ? JSON.parse(historyStr) : [];
                    history = history.filter((h: any) => h.name !== productionMetadata.name);
                    history.unshift({ ...productionMetadata });
                    localStorage.setItem('cosmo_production_history', JSON.stringify(history.slice(0, 10)));
                    handleSaveProject();
                    setShowProductionForm(false);
                    internalLog(`Agent: Draft production manifest saved successfully.`);
                  }}
                  style={{ flex: 1, padding: '14px', borderRadius: '6px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#8B5CF6', fontWeight: '800', cursor: 'pointer', fontSize: '11px' }}
                >
                  SAVE DRAFT
                </button>
                <button 
                  onClick={() => {
                    setShowProductionForm(false);
                    handleProduce();
                  }}
                  style={{ flex: 1, padding: '14px', borderRadius: '6px', background: 'var(--accent)', border: 'none', color: '#000', fontWeight: '900', cursor: 'pointer', fontSize: '11px' }}
                >
                  CONFIRM & RENDER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CINEMA PREVIEW OVERLAY */}
      <AnimatePresence>
        {showPreview && lastGeneratedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.95)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(20px)'
            }}
          >
            {/* Header */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '20px 30px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)'
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '900', letterSpacing: '2px', color: 'var(--accent)' }}>PREMIERE PREVIEW</div>
                <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '4px' }}>{lastGeneratedFile}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleOpenRender}
                  style={{
                    padding: '8px 16px', borderRadius: '6px',
                    background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
                    color: '#8B5CF6', fontSize: '10px', fontWeight: '800', cursor: 'pointer'
                  }}
                >
                  OPEN FOLDER
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', fontSize: '10px', fontWeight: '800', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <X size={12} /> CLOSE
                </button>
              </div>
            </div>

            {/* Video Player */}
            <video
              src={`${API_BASE}/api/renders/${lastGeneratedFile}`}
              autoPlay
              muted
              controls
              style={{
                maxWidth: '85vw', maxHeight: '75vh',
                borderRadius: '8px',
                boxShadow: '0 0 80px rgba(0,255,204,0.15), 0 20px 60px rgba(0,0,0,0.8)'
              }}
            />

            {/* Footer hint */}
            <div style={{ marginTop: '20px', fontSize: '10px', opacity: 0.3, letterSpacing: '1px' }}>
              Starts muted — click the volume icon on the player to hear audio
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
