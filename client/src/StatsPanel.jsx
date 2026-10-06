import React, { useState, useMemo } from 'react';
import { Users, Zap, TrendingUp, ArrowUpRight, Timer } from 'lucide-react';

const StatsPanel = ({ analytics = {}, teamConfig = {} }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [sortBy, setSortBy] = useState('distance_m');
    const [sortAsc, setSortAsc] = useState(false);

    const possession = analytics.possession || { home: 50, away: 50 };
    const players = analytics.players || {};
    const formation = analytics.formation || {};
    const events = analytics.events || [];

    // Compute team-level aggregate stats
    const teamStats = useMemo(() => {
        const stats = { 0: { distance: 0, sprints: 0, count: 0, maxSpeed: 0 }, 1: { distance: 0, sprints: 0, count: 0, maxSpeed: 0 } };
        Object.values(players).forEach(p => {
            const t = p.team;
            if (t === 0 || t === 1) {
                stats[t].distance += p.distance_m;
                stats[t].sprints += p.sprint_count;
                stats[t].count += 1;
                stats[t].maxSpeed = Math.max(stats[t].maxSpeed, p.max_speed_kmh);
            }
        });
        return stats;
    }, [players]);

    // Sorted player list
    const sortedPlayers = useMemo(() => {
        return Object.entries(players)
            .map(([id, p]) => ({ id: parseInt(id), ...p }))
            .filter(p => p.team === 0 || p.team === 1)
            .sort((a, b) => sortAsc ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]);
    }, [players, sortBy, sortAsc]);

    const handleSort = (col) => {
        if (sortBy === col) setSortAsc(!sortAsc);
        else { setSortBy(col); setSortAsc(false); }
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'players', label: 'Players', icon: Users },
        { id: 'events', label: 'Events', icon: Zap },
    ];

    return (
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
            {/* Tab Bar */}
            <div className="flex border-b border-slate-100">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold uppercase tracking-wider transition-all
              ${activeTab === tab.id
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="p-4 flex-1 overflow-auto max-h-[400px]">
                {/* ── Overview Tab ── */}
                {activeTab === 'overview' && (
                    <div className="space-y-5">
                        {/* Possession */}
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase mb-2">Possession</div>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-lg font-black" style={{ color: teamConfig[0]?.color || '#3b82f6' }}>
                                    {possession.home}%
                                </span>
                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden flex">
                                    <div className="h-full rounded-l-full transition-all duration-500" style={{ width: `${possession.home}%`, backgroundColor: teamConfig[0]?.color || '#3b82f6' }}></div>
                                    <div className="h-full rounded-r-full transition-all duration-500" style={{ width: `${possession.away}%`, backgroundColor: teamConfig[1]?.color || '#ef4444' }}></div>
                                </div>
                                <span className="text-lg font-black" style={{ color: teamConfig[1]?.color || '#ef4444' }}>
                                    {possession.away}%
                                </span>
                            </div>
                        </div>

                        {/* Team Comparison Grid */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: teamConfig[0]?.color }}>{(teamStats[0].distance / 1000).toFixed(1)} km</div>
                            </div>
                            <div className="text-xs font-bold text-slate-400 flex items-center justify-center">Distance</div>
                            <div className="text-left">
                                <div className="text-sm font-bold" style={{ color: teamConfig[1]?.color }}>{(teamStats[1].distance / 1000).toFixed(1)} km</div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: teamConfig[0]?.color }}>{teamStats[0].sprints}</div>
                            </div>
                            <div className="text-xs font-bold text-slate-400 flex items-center justify-center">Sprints</div>
                            <div className="text-left">
                                <div className="text-sm font-bold" style={{ color: teamConfig[1]?.color }}>{teamStats[1].sprints}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: teamConfig[0]?.color }}>{teamStats[0].maxSpeed.toFixed(1)}</div>
                            </div>
                            <div className="text-xs font-bold text-slate-400 flex items-center justify-center">Max km/h</div>
                            <div className="text-left">
                                <div className="text-sm font-bold" style={{ color: teamConfig[1]?.color }}>{teamStats[1].maxSpeed.toFixed(1)}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: teamConfig[0]?.color }}>{(formation[0]?.avg_width * 100 || 0).toFixed(0)}%</div>
                            </div>
                            <div className="text-xs font-bold text-slate-400 flex items-center justify-center">Width</div>
                            <div className="text-left">
                                <div className="text-sm font-bold" style={{ color: teamConfig[1]?.color }}>{(formation[1]?.avg_width * 100 || 0).toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Players Tab ── */}
                {activeTab === 'players' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-400 uppercase border-b border-slate-100">
                                    <th className="py-2 text-left font-bold">ID</th>
                                    <th className="py-2 text-left font-bold cursor-pointer hover:text-slate-600" onClick={() => handleSort('distance_m')}>
                                        Dist {sortBy === 'distance_m' && (sortAsc ? '↑' : '↓')}
                                    </th>
                                    <th className="py-2 text-left font-bold cursor-pointer hover:text-slate-600" onClick={() => handleSort('avg_speed_kmh')}>
                                        Avg {sortBy === 'avg_speed_kmh' && (sortAsc ? '↑' : '↓')}
                                    </th>
                                    <th className="py-2 text-left font-bold cursor-pointer hover:text-slate-600" onClick={() => handleSort('max_speed_kmh')}>
                                        Max {sortBy === 'max_speed_kmh' && (sortAsc ? '↑' : '↓')}
                                    </th>
                                    <th className="py-2 text-left font-bold cursor-pointer hover:text-slate-600" onClick={() => handleSort('sprint_count')}>
                                        Sprints {sortBy === 'sprint_count' && (sortAsc ? '↑' : '↓')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPlayers.map(p => (
                                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                                        <td className="py-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: teamConfig[p.team]?.color || '#888' }}></div>
                                                <span className="font-bold text-slate-700">#{p.id}</span>
                                            </div>
                                        </td>
                                        <td className="py-1.5 font-mono text-slate-600">{p.distance_m.toFixed(0)}m</td>
                                        <td className="py-1.5 font-mono text-slate-600">{p.avg_speed_kmh.toFixed(1)}</td>
                                        <td className="py-1.5 font-mono text-slate-600">{p.max_speed_kmh.toFixed(1)}</td>
                                        <td className="py-1.5 font-mono text-slate-600">{p.sprint_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {sortedPlayers.length === 0 && (
                            <div className="text-center text-slate-400 py-6 text-sm">No player data available</div>
                        )}
                    </div>
                )}

                {/* ── Events Tab ── */}
                {activeTab === 'events' && (
                    <div className="space-y-1.5 max-h-[350px] overflow-auto">
                        {events.length === 0 && (
                            <div className="text-center text-slate-400 py-6 text-sm">No events detected</div>
                        )}
                        {events.slice(0, 50).map((evt, i) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition text-xs">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${evt.type === 'sprint' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                                    }`}>
                                    {evt.type === 'sprint' ? <Zap size={12} /> : <ArrowUpRight size={12} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="font-bold text-slate-700">
                                        {evt.type === 'sprint'
                                            ? `Player #${evt.player_id} sprint`
                                            : `Possession → ${teamConfig[evt.to_team]?.name || `Team ${evt.to_team}`}`}
                                    </span>
                                    {evt.speed_kmh && <span className="text-slate-400 ml-1">{evt.speed_kmh} km/h</span>}
                                </div>
                                <div className="flex items-center gap-1 text-slate-400 flex-shrink-0">
                                    <Timer size={10} />
                                    <span className="font-mono">{formatEventTime(evt.time)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const formatEventTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default StatsPanel;
