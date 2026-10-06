# PitchVision - AI Sports Analytics

PitchVision is a professional-grade sports analytics dashboard that uses state-of-the-art Computer Vision to extract tactical insights from match footage. It tracks players and the ball, classifies teams, computes real-time analytics (possession, speed, distance, sprints), and visualizes everything in a broadcast-style interface.

## Architecture: Hybrid Cloud-Local

This project uses a hybrid architecture to leverage high-performance GPUs without local hardware requirements:

1.  **Frontend (Local):** React + Vite application running on localhost. Handles the UI, video playback, overlay rendering, and analytics visualization.

2.  **Middleware (Local):** Node.js Express server. Manages file uploads and coordinates communication via Socket.IO.

3.  **AI Engine (Cloud):** Google Colab (Tesla T4 GPU). Runs YOLO26x inference, BoTSORT tracking, K-Means team classification, and the full analytics pipeline, tunneling data back to the local machine via Ngrok.

## AI/ML Pipeline

| Stage | Technology | Description |
|-------|-----------|-------------|
| **Detection** | YOLO26x (Extra-Large) | State-of-the-art object detection for players (COCO class 0) and ball (class 32) |
| **Tracking** | BoTSORT | Multi-object tracking with persistent ID assignment across frames |
| **Team Classification** | K-Means (k=3) | Unsupervised jersey color clustering in HSV space. 3rd cluster isolates referees |
| **Pitch Filtering** | HSV Green Mask | Validates detections are on-pitch by analyzing feet-region grass presence |
| **Perspective Transform** | OpenCV Homography | 4-point calibration maps video coordinates to normalized pitch coordinates |
| **Track Smoothing** | Pandas Interpolation | Linear interpolation fills gaps up to 15 frames for smooth trajectories |
| **Analytics Engine** | Custom Post-Processing | Computes possession, speed, distance, sprints, heatmaps, formation metrics, and events |

## Features

*   **High-Fidelity Player Tracking** — YOLO26x for maximum detection quality at 1080p
*   **Real-Time Possession** — Ball proximity-based possession calculation per frame
*   **Speed & Distance Metrics** — Per-player velocity (km/h), cumulative distance (m), and sprint detection
*   **Tactical Net** — Real-time visualization of passing options and team shape
*   **Team Classification** — Automatic jersey color detection with referee filtering
*   **Movement Heatmaps** — 20×20 grid density maps per team
*   **Formation Analysis** — Team width and depth metrics
*   **Event Detection** — Possession changes and sprint events with timestamps
*   **Interactive Dashboard** — Tabbed right panel: Pitch Map, Stats, Heatmaps
*   **Export Render** — Server-side rendered analytics overlay for video export
*   **Pitch Calibration** — 4-point perspective calibration for accurate bird's-eye mapping

## Prerequisites

*   Node.js (v16 or higher)
*   Python 3.9+ (For local fallback only)
*   Google Account (For Colab GPU access)
*   Ngrok Account (Free tier is sufficient)

## Installation

1.  **Clone the repository:**

    git clone <repository-url>
    cd PitchVision

2.  **Install Backend Dependencies:**

    npm install

3.  **Install Frontend Dependencies:**

    cd client
    npm install
    cd ..

## How to Run

### Step 1: Start the AI Engine (Google Colab)

1.  Open the provided [Colab notebook](https://colab.research.google.com/drive/1363R4Tko-uPrElTyn47sf145VjO2CqPl?usp=sharing)
2.  Set Runtime to **T4 GPU**.
3.  Insert your Ngrok Auth Token in the script.
4.  Run the cell.
5.  **Copy the Ngrok URL** (e.g., `https://xxxx-xx-xx.ngrok-free.app`).

### Step 2: Configure Local Frontend

1.  Open `client/src/App.jsx`.
2.  Paste the Ngrok URL into the configuration constant:

    const SOCKET_URL = 'https://your-ngrok-url.ngrok-free.app';

### Step 3: Launch Local Application

1.  Start the Development Server:

    cd client
    npm run dev

2.  Open your browser to `http://localhost:5173`.

**Important:** Before using the app, open your Ngrok URL in a separate browser tab and click "Visit Site" to bypass the security warning. This only needs to be done once per session.

## Output Data Format

The pipeline outputs a JSON file with the following structure:

```json
{
  "frames": [
    {
      "t": 0.033,
      "p": [[id, x, y, w, h, team, hx, hy, speed_kmh], ...],
      "b": [x, y, w, h, hx, hy]
    }
  ],
  "analytics": {
    "possession": {"home": 58.2, "away": 41.8},
    "players": {"1": {"team": 0, "distance_m": 342.5, "avg_speed_kmh": 7.2, "max_speed_kmh": 28.1, "sprint_count": 12}},
    "heatmaps": {"0": [[...]], "1": [[...]]},
    "events": [{"frame": 120, "time": 4.0, "type": "possession_change", "to_team": 1}],
    "formation": {"0": {"avg_width": 0.45, "avg_depth": 0.62}}
  },
  "meta": {"fps": 30, "total_frames": 900, "model": "YOLO26x", "tracker": "BoTSORT"}
}
```

## Directory Structure

*   `/client` — React Frontend (Vite + Tailwind)
*   `/client/src/App.jsx` — Main dashboard with video overlay and analytics integration
*   `/client/src/PitchMap.jsx` — 2D bird's-eye pitch view with real-time player positions
*   `/client/src/StatsPanel.jsx` — Match statistics, player table, and event log
*   `/client/src/Heatmap.jsx` — Canvas-based movement density visualization
*   `/client/src/Calibration.jsx` — 4-point pitch perspective calibration
*   `/uploads` — Temporary storage for raw video files
*   `/outputs` — Processed JSON telemetry and rendered videos
*   `server.js` — Node.js Express + Socket.IO orchestration
*   `vision.py` — Full CV pipeline: YOLO26x → BoTSORT → K-Means → Analytics Engine