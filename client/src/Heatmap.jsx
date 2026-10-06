import React, { useRef, useEffect, useState } from 'react';

const Heatmap = ({ data, teamColor = '#39ff14', label = 'Team' }) => {
    const canvasRef = useRef(null);
    const [hoveredCell, setHoveredCell] = useState(null);

    useEffect(() => {
        if (!data || !Array.isArray(data) || data.length === 0 || !Array.isArray(data[0])) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rows = data.length;
        const cols = data[0].length;
        if (rows === 0 || cols === 0) return;

        const cellW = canvas.width / cols;
        const cellH = canvas.height / rows;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw pitch background
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw heatmap cells
        for (let y = 0; y < rows; y++) {
            if (!Array.isArray(data[y])) continue;
            for (let x = 0; x < cols; x++) {
                const intensity = data[y][x] || 0;
                if (intensity > 0.02) {
                    const alpha = Math.min(intensity * 0.85, 0.85);
                    ctx.fillStyle = hexToRgba(teamColor, alpha);
                    ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                }
            }
        }

        // Apply gaussian-like blur effect by drawing again with larger cells at lower opacity
        ctx.globalAlpha = 0.3;
        const blurCellW = cellW * 1.5;
        const blurCellH = cellH * 1.5;
        for (let y = 0; y < rows; y++) {
            if (!Array.isArray(data[y])) continue;
            for (let x = 0; x < cols; x++) {
                const intensity = data[y][x] || 0;
                if (intensity > 0.1) {
                    ctx.fillStyle = hexToRgba(teamColor, intensity * 0.5);
                    ctx.fillRect(
                        x * cellW - (blurCellW - cellW) / 2,
                        y * cellH - (blurCellH - cellH) / 2,
                        blurCellW, blurCellH
                    );
                }
            }
        }
        ctx.globalAlpha = 1.0;

        // Draw pitch lines
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        // Half line
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        // Center circle
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.15, 0, Math.PI * 2);
        ctx.stroke();
        // Penalty areas
        const paW = canvas.width * 0.4;
        const paH = canvas.height * 0.1;
        ctx.strokeRect((canvas.width - paW) / 2, 0, paW, paH);
        ctx.strokeRect((canvas.width - paW) / 2, canvas.height - paH, paW, paH);

    }, [data, teamColor]);

    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label} Heatmap</span>
                <div className="w-24 h-2 rounded-full overflow-hidden flex">
                    <div className="flex-1" style={{ background: `linear-gradient(to right, transparent, ${teamColor})` }}></div>
                </div>
            </div>
            <canvas
                ref={canvasRef}
                width={300}
                height={450}
                className="w-full aspect-[2/3] rounded-lg border border-slate-700/50 pointer-events-none"
                style={{ imageRendering: 'auto' }}
            />
        </div>
    );
};

export default Heatmap;
