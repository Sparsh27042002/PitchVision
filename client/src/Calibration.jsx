import React, { useState, useRef, useEffect } from 'react';

const Calibration = ({ file, onComplete, onCancel }) => {
  const [points, setPoints] = useState([]);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    videoRef.current.src = url;
    videoRef.current.currentTime = 0.5;
  }, [file]);

  const handleSeeked = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  };

  const handleCanvasClick = (e) => {
    if (points.length >= 4) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = ((e.clientX - rect.left) * scaleX) / canvasRef.current.width;
    const y = ((e.clientY - rect.top) * scaleY) / canvasRef.current.height;
    setPoints([...points, { x, y }]);
  };

  const handleConfirm = () => {
    if (points.length === 4) {
      const pointsStr = points.map(p => `${p.x},${p.y}`).join(',');
      onComplete(pointsStr);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-95 flex flex-col items-center justify-center p-4">
      <h2 className="text-xl font-bold text-white mb-2">Calibrate Pitch Perspective</h2>
      <p className="text-slate-400 mb-4">Click 4 corners in order: Top-Left, Top-Right, Bottom-Right, Bottom-Left</p>
      
      <div className="relative border border-slate-700">
        <video
          ref={videoRef}
          className="hidden"
          onSeeked={handleSeeked}
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-crosshair max-w-[80vw] max-h-[70vh] object-contain"
        />
        {points.map((p, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 bg-[#39ff14] rounded-full transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            <span className="absolute top-4 left-1/2 transform -translate-x-1/2 text-[#39ff14] text-xs font-bold">
              {i + 1}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-4">
        <button onClick={() => setPoints([])} className="px-4 py-2 bg-slate-700 text-white rounded">Reset</button>
        <button onClick={onCancel} className="px-4 py-2 bg-red-600 text-white rounded">Cancel</button>
        <button
          onClick={handleConfirm}
          disabled={points.length !== 4}
          className={`px-4 py-2 rounded text-white ${points.length === 4 ? 'bg-[#00f3ff] text-slate-900 font-bold' : 'bg-slate-600 opacity-50'}`}
        >
          Confirm & Process
        </button>
      </div>
    </div>
  );
};

export default Calibration;