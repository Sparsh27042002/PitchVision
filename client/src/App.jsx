import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Play, Pause, Upload, Activity, Volume2, VolumeX,
  Zap, Trophy, BarChart3, Download, Settings, RefreshCw, Layers,
  Flame, ChevronDown, ChevronUp
} from 'lucide-react';
import Calibration from './Calibration';
import PitchMap from './PitchMap';
import StatsPanel from './StatsPanel';
import Heatmap from './Heatmap';

const SOCKET_URL = 'https://brainlessly-tracklaying-annie.ngrok-free.dev';

const App = () => {
  const [appState, setAppState] = useState('IDLE');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState(["> SYSTEM ONLINE"]);
  const [matchData, setMatchData] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [meta, setMeta] = useState(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [calibrationFile, setCalibrationFile] = useState(null);
  const [currentPlayers, setCurrentPlayers] = useState([]);
  const [currentBall, setCurrentBall] = useState(null);
  const [showHeatmaps, setShowHeatmaps] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('pitch'); // 'pitch' | 'stats' | 'heatmap'

  const [teamConfig, setTeamConfig] = useState({
    0: { name: 'Home', color: '#3b82f6' },
    1: { name: 'Away', color: '#ef4444' }
  });

  const currentFrameData = useRef({ p: [], b: null });
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const animationRef = useRef(null);
  const lastFrameIndex = useRef(0);
  const [overlayStyle, setOverlayStyle] = useState({});

  const formatTime = (t) => { const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; };

  const updateOverlayDimensions = () => {
    if (!videoRef.current || !containerRef.current) return;
    const { videoWidth: vw, videoHeight: vh } = videoRef.current;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (vw === 0) return;

    const videoRatio = vw / vh;
    const containerRatio = cw / ch;
    let finalW, finalH, finalLeft, finalTop;

    if (containerRatio > videoRatio) {
      finalH = ch; finalW = finalH * videoRatio; finalTop = 0; finalLeft = (cw - finalW) / 2;
    } else {
      finalW = cw; finalH = finalW / videoRatio; finalLeft = 0; finalTop = (ch - finalH) / 2;
    }
    setOverlayStyle({ width: `${finalW}px`, height: `${finalH}px`, left: `${finalLeft}px`, top: `${finalTop}px`, position: 'absolute' });
  };

  useEffect(() => { window.addEventListener('resize', updateOverlayDimensions); return () => window.removeEventListener('resize', updateOverlayDimensions); }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, { extraHeaders: { "ngrok-skip-browser-warning": "69420" }, reconnectionAttempts: 5 });
    socket.on('connect', () => setConnectionStatus('ONLINE'));
    socket.on('disconnect', () => setConnectionStatus('OFFLINE'));
    socket.on('analysis-progress', (pct) => { setAppState('PROCESSING'); setProgress(pct); });

    socket.on('analysis-complete', async (data) => {
      try {
        setDownloadUrl(`${SOCKET_URL}${data.downloadUrl}`);
        const jsonRes = await fetch(`${SOCKET_URL}${data.jsonUrl}`, { headers: { "ngrok-skip-browser-warning": "69420" } });
        if (!jsonRes.ok) throw new Error("JSON Fetch Failed");
        const json = await jsonRes.json();

        // New JSON schema: { frames, analytics, meta }
        if (json.frames) {
          setMatchData(json.frames);
          setAnalytics(json.analytics || null);
          setMeta(json.meta || null);
        } else {
          // Backward compatibility with old flat array format
          setMatchData(json);
        }
        setAppState('READY');
      } catch (err) {
        console.error('Failed to load analysis data:', err);
        setAppState('IDLE');
      }
    });
    return () => socket.close();
  }, []);

  const syncLoop = () => {
    if (videoRef.current && matchData.length > 0 && !videoRef.current.paused && videoRef.current.readyState >= 2) {
      const t = videoRef.current.currentTime + 0.15;
      setCurrentTime(videoRef.current.currentTime);

      let startIndex = lastFrameIndex.current;
      if (matchData[startIndex] && matchData[startIndex].t > t) startIndex = 0;

      let frame = null;
      for (let i = startIndex; i < Math.min(matchData.length, startIndex + 60); i++) {
        if (Math.abs(matchData[i].t - t) < 0.1) {
          frame = matchData[i];
          lastFrameIndex.current = i;
          break;
        }
      }

      if (frame) {
        currentFrameData.current = frame;
        const safePlayers = frame.p || [];
        const mappedPlayers = safePlayers
          .filter(p => p[6] >= -5 && p[6] <= 5 && p[7] >= -5 && p[7] <= 5)
          .map(p => ({ x: p[6], y: p[7], team: p[5] }));
        const mappedBall = frame.b && frame.b[4] >= -5 && frame.b[4] <= 5 ? { x: frame.b[4], y: frame.b[5] } : null;
        setCurrentPlayers(mappedPlayers);
        setCurrentBall(mappedBall);
      }
    }
    animationRef.current = requestAnimationFrame(syncLoop);
  };

  useEffect(() => { if (appState === 'READY') animationRef.current = requestAnimationFrame(syncLoop); return () => cancelAnimationFrame(animationRef.current); }, [appState, matchData]);

  const togglePlay = () => { if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); } else { videoRef.current.pause(); setIsPlaying(false); } };
  const handleSeek = (e) => { const t = parseFloat(e.target.value); videoRef.current.currentTime = t; setCurrentTime(t); lastFrameIndex.current = 0; };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCalibrationFile(file);
  };

  const startUploadProcess = async (pointsStr) => {
    setAppState('PROCESSING');
    const fd = new FormData();
    fd.append('video', calibrationFile);
    fd.append('points', pointsStr);
    setVideoBlobUrl(URL.createObjectURL(calibrationFile));
    setCalibrationFile(null);
    try {
      await fetch(`${SOCKET_URL}/upload`, { method: 'POST', body: fd });
    } catch (err) {
      setAppState('IDLE');
    }
  };

  const handleDemo = async () => {
    if (connectionStatus !== 'ONLINE') return;
    setAppState('PROCESSING');
    setVideoBlobUrl(`${SOCKET_URL}/uploads/demo_match.mp4?ngrok-skip-browser-warning=true`);
    try {
      await fetch(`${SOCKET_URL}/demo`, { headers: { "ngrok-skip-browser-warning": "69420" } });
    } catch (err) {
      setAppState('IDLE');
    }
  };

  const downloadVideo = async () => { if (!downloadUrl) return; try { const res = await fetch(downloadUrl, { headers: { "ngrok-skip-browser-warning": "69420" } }); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "PitchVision.mp4"; document.body.appendChild(a); a.click(); } catch (e) { } };

  const getTacticalNet = (players = []) => {
    const lines = [];
    const teams = { 0: [], 1: [] };

    players.forEach(p => {
      const teamId = p[5];
      if (teams[teamId]) teams[teamId].push(p);
    });

    [0, 1].forEach(teamId => {
      const roster = teams[teamId];
      if (!roster || roster.length < 2) return;

      roster.forEach((p1, i) => {
        const distances = roster.map((p2, j) => {
          if (i === j) return { dist: Infinity, p2 };
          const dist = Math.sqrt(Math.pow(p1[1] - p2[1], 2) + Math.pow(p1[2] - p2[2], 2));
          return { dist, p2 };
        });

        distances.sort((a, b) => a.dist - b.dist);
        const nearest = distances.slice(0, 2);

        nearest.forEach(n => {
          if (n.dist < 0.3) {
            lines.push({
              x1: p1[1] * 100, y1: p1[2] * 100,
              x2: n.p2[1] * 100, y2: n.p2[2] * 100,
              team: teamId
            });
          }
        });
      });
    });
    return lines;
  };

  // Get current possession from analytics
  const possession = analytics?.possession || { home: 50, away: 50 };

  // Get current player speed for overlay
  const getPlayerSpeed = (playerId) => {
    const frame = currentFrameData.current;
    if (!frame || !frame.p) return null;
    const p = frame.p.find(p => p[0] === playerId);
    if (p && p.length >= 9 && p[8] > 2) return p[8]; // Only show speed > 2 km/h
    return null;
  };

  const rightPanelTabs = [
    { id: 'pitch', label: 'Pitch', icon: Layers },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'heatmap', label: 'Heat', icon: Flame },
  ];

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans selection:bg-blue-100">
      {calibrationFile && (
        <Calibration
          file={calibrationFile}
          onComplete={startUploadProcess}
          onCancel={() => setCalibrationFile(null)}
        />
      )}

      {/* ── Navbar ── */}
      <nav className="bg-white border-b border-slate-200 fixed w-full top-0 z-50 h-14">
        <div className="max-w-[1600px] mx-auto px-6 h-full flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Trophy size={15} className="text-white" />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">PitchVision</h1>
            {meta && (
              <span className="hidden md:inline text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {meta.model} • {meta.tracker}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {appState === 'READY' && <button onClick={() => window.location.reload()} className="p-2 text-slate-400 hover:text-slate-600 transition rounded-lg hover:bg-slate-100" title="New Analysis"><RefreshCw size={16} /></button>}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 bg-slate-50 rounded-full border border-slate-200 text-slate-500">
              <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'ONLINE' ? 'bg-emerald-500 shadow-sm shadow-emerald-500' : 'bg-amber-500'}`}></div>
              {connectionStatus === 'ONLINE' ? 'Engine Ready' : 'Offline'}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-4 pt-20 h-[calc(100vh)] flex flex-col gap-4">

        <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[500px]">

          {/* ── Video Panel ── */}
          <div className="flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl relative group flex flex-col justify-center border border-slate-900">
            <div ref={containerRef} className="relative w-full h-full">

              {appState !== 'READY' && (
                <div className="absolute inset-0 z-30 bg-slate-900 flex flex-col items-center justify-center">
                  {appState === 'IDLE' ? (
                    <div className="text-center space-y-6">
                      <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/30 mb-4">
                        <Trophy size={28} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-extrabold text-white">Upload Match Footage</h2>
                      <p className="text-slate-400 text-sm max-w-xs">Analyze player movement, team formations, and match events using YOLO26x computer vision.</p>
                      <div className="flex gap-3">
                        <button onClick={handleDemo} className="px-6 py-2.5 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition text-sm">Load Demo</button>
                        <label className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl cursor-pointer hover:from-blue-500 hover:to-indigo-500 transition shadow-lg shadow-blue-600/25 text-sm">
                          Upload .MP4
                          <input type="file" accept="video/mp4" onChange={handleFileSelect} className="hidden" />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="w-72 space-y-4">
                      <div className="flex justify-between text-xs font-extrabold text-blue-400"><span>PROCESSING</span><span>{progress}%</span></div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
                      </div>
                      <p className="text-center text-xs text-slate-500">{
                        progress < 45 ? 'Detecting players & ball...' :
                          progress < 60 ? 'Interpolating tracks...' :
                            progress < 70 ? 'Computing analytics...' :
                              progress < 95 ? 'Rendering output...' :
                                'Finalizing...'
                      }</p>
                    </div>
                  )}
                </div>
              )}

              <video ref={videoRef} src={videoBlobUrl} className="w-full h-full object-contain" onLoadedMetadata={(e) => { updateOverlayDimensions(); setDuration(e.target.duration); }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onClick={togglePlay} playsInline />

              {appState === 'READY' && (
                <div className="pointer-events-none overflow-hidden" style={overlayStyle}>

                  {/* Tactical Net */}
                  <svg className="absolute inset-0 w-full h-full">
                    {getTacticalNet(currentFrameData.current.p || []).map((line, i) => (
                      <line
                        key={i}
                        x1={`${line.x1}%`} y1={`${line.y1}%`}
                        x2={`${line.x2}%`} y2={`${line.y2}%`}
                        stroke={teamConfig[line.team]?.color || '#ffffff'}
                        strokeWidth="1"
                        strokeOpacity="0.2"
                      />
                    ))}
                  </svg>

                  {/* Player Overlays */}
                  {(currentFrameData.current.p || []).map(p => {
                    const [id, x, y, w, h, team] = p;
                    const speed = p.length >= 9 ? p[8] : null;
                    const color = teamConfig[team]?.color || '#ffffff';

                    return (
                      <div key={id} className="absolute transition-all duration-100 ease-linear will-change-transform" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}>
                        {/* Corner brackets */}
                        <div className="absolute bottom-0 left-0 w-full h-full opacity-75">
                          <div className="absolute bottom-[2%] left-0 w-[20%] h-[10%] border-b-[2px] border-l-[2px]" style={{ borderColor: color }}></div>
                          <div className="absolute bottom-[2%] right-0 w-[20%] h-[10%] border-b-[2px] border-r-[2px]" style={{ borderColor: color }}></div>
                        </div>

                        {/* Player ID */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[7px] font-extrabold text-white px-1 rounded-sm" style={{ backgroundColor: `${color}90` }}>
                          {id}
                        </div>

                        {/* Speed indicator */}
                        {speed && speed > 3 && (
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[6px] font-bold px-1 rounded-sm whitespace-nowrap"
                            style={{
                              backgroundColor: speed > 21 ? '#ef4444' : speed > 14 ? '#f59e0b' : '#64748b',
                              color: '#fff'
                            }}>
                            {speed.toFixed(0)} km/h
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Ball */}
                  {currentFrameData.current.b && currentFrameData.current.b.length >= 4 && (
                    <div className="absolute border-2 border-yellow-400 rounded-sm shadow-[0_0_6px_rgba(250,204,21,0.5)]" style={{ left: `${currentFrameData.current.b[0] * 100}%`, top: `${currentFrameData.current.b[1] * 100}%`, width: `${currentFrameData.current.b[2] * 100}%`, height: `${currentFrameData.current.b[3] * 100}%`, transition: 'all 0.1s linear' }}></div>
                  )}
                </div>
              )}

              {/* Video Controls */}
              {appState === 'READY' && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <input type="range" min="0" max={duration} step="0.1" value={currentTime} onChange={handleSeek} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer mb-2" />
                  <div className="flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                      <button onClick={togglePlay} className="hover:text-blue-400 transition">{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                      <span className="text-[11px] font-mono text-slate-300">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={downloadVideo} className="text-[10px] font-bold bg-white/10 px-2.5 py-1 rounded-lg hover:bg-white/20 transition flex items-center gap-1"><Download size={12} />Export</button>
                      <button onClick={() => { videoRef.current.muted = !videoRef.current.muted; setIsMuted(!isMuted); }} className="p-1 hover:text-blue-400 transition">{isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            {/* Panel Tab Switcher */}
            {appState === 'READY' && (
              <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {rightPanelTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setRightPanelTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all
                          ${rightPanelTab === tab.id
                        ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                  >
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Pitch Map Panel */}
            {appState === 'READY' && rightPanelTab === 'pitch' && (
              <PitchMap
                players={currentPlayers}
                ball={currentBall}
                possession={possession}
                teamConfig={teamConfig}
              />
            )}

            {/* Stats Panel */}
            {appState === 'READY' && rightPanelTab === 'stats' && analytics && (
              <StatsPanel analytics={analytics} teamConfig={teamConfig} />
            )}

            {/* Heatmap Panel */}
            {appState === 'READY' && rightPanelTab === 'heatmap' && analytics && analytics.heatmaps && (
              <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4 space-y-4">
                {analytics.heatmaps['0'] && (
                  <Heatmap
                    data={analytics.heatmaps['0']}
                    teamColor={teamConfig[0]?.color || '#3b82f6'}
                    label={teamConfig[0]?.name || 'Home'}
                  />
                )}
                {analytics.heatmaps['1'] && (
                  <Heatmap
                    data={analytics.heatmaps['1']}
                    teamColor={teamConfig[1]?.color || '#ef4444'}
                    label={teamConfig[1]?.name || 'Away'}
                  />
                )}
              </div>
            )}

            {/* Tactical Setup (always visible) */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Settings size={16} className="text-slate-400" />
                <h3 className="font-bold text-slate-800 text-sm">Tactical Setup</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Home Team</label>
                  <div className="flex gap-2 mt-1">
                    <input type="color" value={teamConfig[0].color} onChange={(e) => setTeamConfig({ ...teamConfig, 0: { ...teamConfig[0], color: e.target.value } })} className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                    <input type="text" value={teamConfig[0].name} onChange={(e) => setTeamConfig({ ...teamConfig, 0: { ...teamConfig[0], name: e.target.value } })} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Away Team</label>
                  <div className="flex gap-2 mt-1">
                    <input type="color" value={teamConfig[1].color} onChange={(e) => setTeamConfig({ ...teamConfig, 1: { ...teamConfig[1], color: e.target.value } })} className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                    <input type="text" value={teamConfig[1].name} onChange={(e) => setTeamConfig({ ...teamConfig, 1: { ...teamConfig[1], name: e.target.value } })} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;