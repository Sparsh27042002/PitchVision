import React from 'react';

const PitchMap = ({ players = [], ball = null, possession = { home: 50, away: 50 }, teamConfig = {} }) => {
  const homeColor = teamConfig[0]?.color || '#3b82f6';
  const awayColor = teamConfig[1]?.color || '#ef4444';
  const homeName = teamConfig[0]?.name || 'Home';
  const awayName = teamConfig[1]?.name || 'Away';
  const ballColor = '#facc15';

  return (
    <div className="flex flex-col gap-4 w-full p-5 bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl font-sans">

      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
        <h2 className="text-sm font-extrabold tracking-widest text-white uppercase">
          Pitch<span style={{ color: homeColor }}>Vision</span>
        </h2>
        <div className="flex gap-3 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor, boxShadow: `0 0 6px ${homeColor}` }}></div>
            <span className="text-slate-300 font-bold uppercase">{homeName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor, boxShadow: `0 0 6px ${awayColor}` }}></div>
            <span className="text-slate-300 font-bold uppercase">{awayName}</span>
          </div>
        </div>
      </div>

      {/* Pitch */}
      <div className="relative w-full aspect-[2/3] bg-[#0a1628] border border-slate-700/50 rounded-xl overflow-hidden">
        {/* Pitch markings */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 150" preserveAspectRatio="none">
          {/* Half line */}
          <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          {/* Center circle */}
          <circle cx="50" cy="75" r="15" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          {/* Center dot */}
          <circle cx="50" cy="75" r="1" fill="rgba(255,255,255,0.2)" />
          {/* Penalty areas */}
          <rect x="25" y="0" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          <rect x="25" y="132" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
          {/* Goal areas */}
          <rect x="35" y="0" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          <rect x="35" y="143" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          {/* Penalty arcs */}
          <path d="M 35 18 Q 50 28, 65 18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          <path d="M 35 132 Q 50 122, 65 132" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        </svg>

        {/* Players */}
        {players.map((p, index) => {
          const color = p.team === 0 ? homeColor : awayColor;
          return (
            <div
              key={index}
              className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-linear"
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                width: '10px',
                height: '10px',
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}, 0 0 16px ${color}40`
              }}
            />
          );
        })}

        {/* Ball */}
        {ball && (
          <div
            className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-linear z-10"
            style={{
              left: `${ball.x * 100}%`,
              top: `${ball.y * 100}%`,
              width: '8px',
              height: '8px',
              backgroundColor: ballColor,
              boxShadow: `0 0 10px ${ballColor}, 0 0 20px ${ballColor}60`,
              border: '1.5px solid rgba(0,0,0,0.4)'
            }}
          />
        )}
      </div>

      {/* Possession Bar */}
      <div className="w-full">
        <div className="flex justify-between text-[10px] mb-1.5 font-extrabold">
          <span style={{ color: homeColor }}>{homeName} {possession.home}%</span>
          <span className="text-slate-500 uppercase text-[9px]">Possession</span>
          <span style={{ color: awayColor }}>{possession.away}% {awayName}</span>
        </div>

        <div className="h-2 w-full flex bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-l-full"
            style={{
              width: `${possession.home}%`,
              backgroundColor: homeColor,
              boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2)`
            }}
          />
          <div
            className="h-full transition-all duration-500 rounded-r-full"
            style={{
              width: `${possession.away}%`,
              backgroundColor: awayColor,
              boxShadow: `inset 0 1px 2px rgba(255,255,255,0.2)`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PitchMap;