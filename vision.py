import cv2
import sys
import json
import os
import numpy as np
import pandas as pd
from ultralytics import YOLO
from collections import defaultdict

# ─── Constants ────────────────────────────────────────────────────────────────
LOWER_GREEN = np.array([35, 40, 40])
UPPER_GREEN = np.array([85, 255, 255])
MAX_GAP_FILL = 15

# Standard pitch dimensions in meters (FIFA regulation)
PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0

# Heatmap grid resolution
HEATMAP_GRID = 20

# Speed thresholds
SPRINT_THRESHOLD_KMH = 21.0  # km/h to count as a sprint


# ─── Pitch Detection ─────────────────────────────────────────────────────────
def is_on_pitch(frame, bbox):
    x1, y1, x2, y2 = map(int, bbox)
    h, w = frame.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y2 = min(h, y2)
    feet_h = max(5, int((y2 - y1) * 0.15))
    feet_y_start = max(0, y2 - feet_h)
    feet_roi = frame[feet_y_start:y2, x1:x2]
    if feet_roi.size == 0:
        return False
    hsv_roi = cv2.cvtColor(feet_roi, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv_roi, LOWER_GREEN, UPPER_GREEN)
    return (np.count_nonzero(mask) / mask.size) > 0.30


# ─── Team Classifier (3-cluster K-Means to filter referees) ──────────────────
class TeamClassifier:
    def __init__(self):
        self.team_colors = []
        self.player_samples = []
        self.trained = False
        self.referee_cluster = -1

    def get_color(self, frame, bbox):
        x1, y1, x2, y2 = map(int, bbox)
        h = y2 - y1
        ty1, ty2 = int(y1 + h * 0.15), int(y1 + h * 0.65)
        crop = frame[ty1:ty2, x1:x2]
        if crop.size == 0:
            return None
        return np.mean(cv2.cvtColor(crop, cv2.COLOR_BGR2HSV), axis=(0, 1))

    def collect(self, frame, bbox):
        c = self.get_color(frame, bbox)
        if c is not None:
            self.player_samples.append(c)

    def train(self):
        if len(self.player_samples) < 10:
            return
        data = np.float32(self.player_samples)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)

        # Use 3 clusters: 2 teams + 1 referee/outlier
        k = min(3, len(data))
        _, labels, centers = cv2.kmeans(data, k, None, criteria, 15, cv2.KMEANS_PP_CENTERS)

        if k == 3:
            # The smallest cluster is likely the referee
            counts = [np.sum(labels == i) for i in range(3)]
            self.referee_cluster = int(np.argmin(counts))

            # The other two are team clusters
            team_indices = [i for i in range(3) if i != self.referee_cluster]
            self.team_colors = [centers[team_indices[0]], centers[team_indices[1]]]
        else:
            self.team_colors = centers[:2]
            self.referee_cluster = -1

        self.trained = True

    def predict(self, frame, bbox):
        if not self.trained:
            return 0, False
        c = self.get_color(frame, bbox)
        if c is None:
            return 0, False

        if self.referee_cluster >= 0 and len(self.team_colors) == 2:
            # Check if this detection is closer to the referee cluster
            all_centers = list(self.team_colors)
            distances = [np.linalg.norm(c - center) for center in all_centers]
            d0 = distances[0]
            d1 = distances[1]
            team = 0 if d0 < d1 else 1

            # Simple referee rejection: if hue is very different from both teams
            min_team_dist = min(d0, d1)
            if min_team_dist > 60:  # Likely referee/outlier
                return -1, True

            return team, False

        d0 = np.linalg.norm(c - self.team_colors[0])
        d1 = np.linalg.norm(c - self.team_colors[1])
        return (0 if d0 < d1 else 1), False


# ─── Track Interpolation ─────────────────────────────────────────────────────
def interpolate_tracks(track_history):
    if not track_history:
        return pd.DataFrame()
    df = pd.DataFrame(track_history, columns=['frame', 'id', 'x', 'y', 'w', 'h', 'team'])
    interpolated_data = []
    for obj_id in df['id'].unique():
        id_df = df[df['id'] == obj_id].sort_values('frame')
        full_range = pd.DataFrame({'frame': range(id_df['frame'].min(), id_df['frame'].max() + 1)})
        id_df = full_range.merge(id_df, on='frame', how='left')
        id_df[['x', 'y', 'w', 'h']] = id_df[['x', 'y', 'w', 'h']].interpolate(method='linear', limit=MAX_GAP_FILL)
        id_df['team'] = id_df['team'].ffill().bfill()
        id_df['id'] = obj_id
        interpolated_data.append(id_df)
    if not interpolated_data:
        return pd.DataFrame()
    return pd.concat(interpolated_data).sort_values('frame').dropna()


# ─── Homography Transform ────────────────────────────────────────────────────
def apply_homography(x, y, matrix):
    if matrix is None:
        return float(x), float(y)
    pt = np.array([[[x, y]]], dtype=np.float32)
    transformed = cv2.perspectiveTransform(pt, matrix)
    return float(transformed[0][0][0]), float(transformed[0][0][1])


# ─── Analytics Engine ─────────────────────────────────────────────────────────
class AnalyticsEngine:
    """Post-processing analytics on tracked data."""

    def __init__(self, fps, total_frames):
        self.fps = fps
        self.total_frames = total_frames
        self.player_positions = defaultdict(list)  # id -> [(frame, hx, hy)]
        self.player_teams = {}  # id -> team
        self.ball_positions = []  # [(frame, hx, hy)]
        self.home_possession_frames = 0
        self.away_possession_frames = 0
        self.events = []
        self.last_possession_team = -1
        self.heatmaps = {0: np.zeros((HEATMAP_GRID, HEATMAP_GRID)), 1: np.zeros((HEATMAP_GRID, HEATMAP_GRID))}

    def add_player(self, frame, player_id, team, hx, hy):
        self.player_positions[player_id].append((frame, hx, hy))
        self.player_teams[player_id] = team
        # Accumulate heatmap
        if team in (0, 1):
            # Clamp hx and hy to 0.0 - 1.0 to prevent out-of-bounds scattering
            chx = min(max(hx, 0.0), 1.0)
            chy = min(max(hy, 0.0), 1.0)
            
            gx = min(int(chx * HEATMAP_GRID), HEATMAP_GRID - 1)
            gy = min(int(chy * HEATMAP_GRID), HEATMAP_GRID - 1)
            self.heatmaps[team][gy][gx] += 1

    def add_ball(self, frame, hx, hy):
        self.ball_positions.append((frame, hx, hy))

    def compute_possession(self, frame, players_in_frame, ball_hx, ball_hy):
        """Determine which team possesses the ball based on proximity."""
        if ball_hx is None or ball_hy is None:
            return

        min_dist = float('inf')
        closest_team = -1

        for p in players_in_frame:
            pid, team, phx, phy = p
            if team not in (0, 1):
                continue
            dist = np.sqrt((phx - ball_hx) ** 2 + (phy - ball_hy) ** 2)
            if dist < min_dist:
                min_dist = dist
                closest_team = team

        if closest_team == 0:
            self.home_possession_frames += 1
        elif closest_team == 1:
            self.away_possession_frames += 1

        # Detect possession change
        if closest_team != self.last_possession_team and closest_team in (0, 1) and self.last_possession_team in (0, 1):
            self.events.append({
                'frame': frame,
                'time': round(frame / self.fps, 2),
                'type': 'possession_change',
                'to_team': closest_team
            })
        if closest_team in (0, 1):
            self.last_possession_team = closest_team

    def compute_player_stats(self):
        """Compute speed, distance, sprint counts for each player."""
        stats = {}
        for pid, positions in self.player_positions.items():
            if len(positions) < 2:
                continue

            positions.sort(key=lambda x: x[0])
            total_distance_m = 0.0
            speeds = []
            sprint_count = 0
            in_sprint = False

            for i in range(1, len(positions)):
                f0, x0, y0 = positions[i - 1]
                f1, x1, y1 = positions[i]

                frame_gap = f1 - f0
                if frame_gap <= 0 or frame_gap > 10:
                    continue

                # Convert normalized coords to meters
                dx_m = (x1 - x0) * PITCH_LENGTH_M
                dy_m = (y1 - y0) * PITCH_WIDTH_M
                dist_m = np.sqrt(dx_m ** 2 + dy_m ** 2)
                total_distance_m += dist_m

                # Speed in m/s, then km/h
                time_s = frame_gap / self.fps
                if time_s > 0:
                    speed_ms = dist_m / time_s
                    speed_kmh = speed_ms * 3.6
                    speeds.append(speed_kmh)

                    # Sprint detection
                    if speed_kmh > SPRINT_THRESHOLD_KMH:
                        if not in_sprint:
                            sprint_count += 1
                            in_sprint = True
                            self.events.append({
                                'frame': f1,
                                'time': round(f1 / self.fps, 2),
                                'type': 'sprint',
                                'player_id': int(pid),
                                'speed_kmh': round(speed_kmh, 1)
                            })
                    else:
                        in_sprint = False

            avg_speed = np.mean(speeds) if speeds else 0
            max_speed = max(speeds) if speeds else 0

            stats[int(pid)] = {
                'team': int(self.player_teams.get(pid, 0)),
                'distance_m': round(total_distance_m, 1),
                'avg_speed_kmh': round(avg_speed, 1),
                'max_speed_kmh': round(max_speed, 1),
                'sprint_count': sprint_count
            }

        return stats

    def compute_formation_stats(self, player_lookup, total_frames):
        """Compute avg team width and depth from homography positions."""
        team_widths = {0: [], 1: []}
        team_depths = {0: [], 1: []}

        for f in range(total_frames):
            if f not in player_lookup:
                continue
            teams_x = {0: [], 1: []}
            teams_y = {0: [], 1: []}
            for p in player_lookup[f]:
                team = int(p.get('team', -1))
                if team not in (0, 1):
                    continue
                hx = float(p.get('hx', p.get('x', 0)))
                hy = float(p.get('hy', p.get('y', 0)))
                if 0 <= hx <= 1 and 0 <= hy <= 1:
                    teams_x[team].append(hx)
                    teams_y[team].append(hy)

            for t in (0, 1):
                if len(teams_x[t]) >= 3:
                    team_widths[t].append(max(teams_x[t]) - min(teams_x[t]))
                    team_depths[t].append(max(teams_y[t]) - min(teams_y[t]))

        formation = {}
        for t in (0, 1):
            formation[t] = {
                'avg_width': round(np.mean(team_widths[t]), 3) if team_widths[t] else 0,
                'avg_depth': round(np.mean(team_depths[t]), 3) if team_depths[t] else 0
            }
        return formation

    def get_analytics_summary(self, player_lookup, total_frames):
        """Generate the full analytics block."""
        total_poss = self.home_possession_frames + self.away_possession_frames
        if total_poss == 0:
            total_poss = 1

        # Normalize heatmaps to 0-1
        heatmaps = {}
        for t in (0, 1):
            hmap = self.heatmaps[t]
            max_val = hmap.max()
            if max_val > 0:
                hmap = hmap / max_val
            heatmaps[str(t)] = np.round(hmap, 3).tolist()

        # Sort events by frame
        self.events.sort(key=lambda e: e['frame'])

        return {
            'possession': {
                'home': round((self.home_possession_frames / total_poss) * 100, 1),
                'away': round((self.away_possession_frames / total_poss) * 100, 1)
            },
            'players': self.compute_player_stats(),
            'heatmaps': heatmaps,
            'events': self.events[:200],  # Cap at 200 events
            'formation': self.compute_formation_stats(player_lookup, total_frames)
        }


# ─── Main Pipeline ────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 4:
        return
    video_path = sys.argv[1]
    output_path = sys.argv[2]
    json_path = sys.argv[3]

    matrix = None
    if len(sys.argv) >= 5 and sys.argv[4]:
        pts = list(map(float, sys.argv[4].split(',')))
        src_pts = np.array(pts).reshape(4, 2).astype(np.float32)
        dst_pts = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)

    # ── Load the best model for maximum detection quality ──
    model = YOLO('yolo26x.pt')
    cap = cv2.VideoCapture(video_path)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))

    classifier = TeamClassifier()
    analytics = AnalyticsEngine(fps, total_frames)
    raw_players = []
    raw_balls = []

    frame_idx = 0
    print("PROGRESS:1", flush=True)

    # ── Pass 1: Detection & Tracking ──
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        if frame_idx % 15 == 0:
            progress = int((frame_idx / total_frames) * 45)
            print(f"PROGRESS:{progress}", flush=True)

        detect_frame = cv2.resize(frame, (1920, 1080))
        results = model.track(
            detect_frame,
            persist=True,
            conf=0.20,
            tracker="botsort.yaml",
            classes=[0, 32],
            verbose=False,
            device=0,
            half=True
        )

        # Collect team color samples in early frames
        if not classifier.trained and frame_idx < 60:
            for r in results:
                if r.boxes:
                    for cls, bbox in zip(r.boxes.cls.cpu().tolist(), r.boxes.xyxy.cpu().tolist()):
                        if cls == 0 and is_on_pitch(detect_frame, bbox):
                            classifier.collect(detect_frame, bbox)

        if not classifier.trained and frame_idx == 60:
            classifier.train()

        for r in results:
            if r.boxes is None:
                continue
            ids = r.boxes.id.int().cpu().tolist() if r.boxes.id is not None else [None] * len(r.boxes)
            clss = r.boxes.cls.int().cpu().tolist()
            coords = r.boxes.xyxy.cpu().tolist()
            confs = r.boxes.conf.cpu().tolist()

            for box_id, cls, bbox, conf in zip(ids, clss, coords, confs):
                nx, ny = float(bbox[0]) / 1920.0, float(bbox[1]) / 1080.0
                nw, nh = float(bbox[2] - bbox[0]) / 1920.0, float(bbox[3] - bbox[1]) / 1080.0

                if cls == 32 and nw < 0.05:
                    raw_balls.append([frame_idx, 999, nx, ny, nw, nh, -1])
                elif cls == 0 and box_id is not None:
                    if conf < 0.30:
                        continue
                    if nx < 0.02 or nx > 0.98:
                        continue
                    if is_on_pitch(detect_frame, bbox):
                        team, is_referee = classifier.predict(detect_frame, bbox)
                        if is_referee:
                            continue  # Skip referees
                        raw_players.append([frame_idx, box_id, nx, ny, nw, nh, team])

        frame_idx += 1

    cap.release()
    print("PROGRESS:50", flush=True)

    # ── Pass 2: Interpolation ──
    smooth_players_df = interpolate_tracks(raw_players)
    smooth_ball_df = interpolate_tracks(raw_balls)

    # Build lookup tables with homography coords
    player_lookup = {}
    if not smooth_players_df.empty:
        for _, row in smooth_players_df.iterrows():
            f = int(row['frame'])
            px, py = float(row['x']), float(row['y'])
            pw, ph = float(row['w']), float(row['h'])

            # Compute homography-mapped position
            if matrix is not None:
                bx = px + pw / 2.0
                by = py + ph
                hx, hy = apply_homography(bx, by, matrix)
            else:
                hx, hy = px, py

            entry = {
                'id': int(row['id']),
                'x': px, 'y': py, 'w': pw, 'h': ph,
                'team': int(row['team']),
                'hx': hx, 'hy': hy
            }

            if f not in player_lookup:
                player_lookup[f] = []
            player_lookup[f].append(entry)

            # Feed analytics
            analytics.add_player(f, int(row['id']), int(row['team']), hx, hy)

    ball_lookup = {}
    if not smooth_ball_df.empty:
        for _, row in smooth_ball_df.iterrows():
            f = int(row['frame'])
            bx, by = float(row['x']), float(row['y'])
            bw, bh = float(row['w']), float(row['h'])

            if matrix is not None:
                bhx, bhy = apply_homography(bx + bw / 2.0, by + bh, matrix)
            else:
                bhx, bhy = bx, by

            ball_lookup[f] = {'x': bx, 'y': by, 'w': bw, 'h': bh, 'hx': bhx, 'hy': bhy}
            analytics.add_ball(f, bhx, bhy)

    print("PROGRESS:60", flush=True)

    # ── Pass 3: Compute per-frame possession & events ──
    for f in range(total_frames):
        players_in_frame = []
        if f in player_lookup:
            for p in player_lookup[f]:
                players_in_frame.append((p['id'], p['team'], p['hx'], p['hy']))

        ball_hx, ball_hy = None, None
        if f in ball_lookup:
            ball_hx = ball_lookup[f]['hx']
            ball_hy = ball_lookup[f]['hy']

        analytics.compute_possession(f, players_in_frame, ball_hx, ball_hy)

    print("PROGRESS:70", flush=True)

    # ── Pass 4: Render output + build JSON ──
    cap = cv2.VideoCapture(video_path)
    frame_idx = 0
    final_json_data = []

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        if frame_idx % 15 == 0:
            progress = 70 + int((frame_idx / total_frames) * 25)
            print(f"PROGRESS:{progress}", flush=True)

        frame_data = {'t': round(float(frame_idx) / float(fps), 3), 'p': [], 'b': None}

        if frame_idx in player_lookup:
            for p in player_lookup[frame_idx]:
                # Compute instantaneous speed for this player
                speed_kmh = 0.0
                pid = p['id']
                positions = analytics.player_positions.get(pid, [])
                if len(positions) >= 2:
                    # Find current position index
                    for i in range(1, len(positions)):
                        if positions[i][0] == frame_idx:
                            f0, x0, y0 = positions[i - 1]
                            f1, x1, y1 = positions[i]
                            fg = f1 - f0
                            if 0 < fg <= 5:
                                dx = (x1 - x0) * PITCH_LENGTH_M
                                dy = (y1 - y0) * PITCH_WIDTH_M
                                dist = np.sqrt(dx ** 2 + dy ** 2)
                                time_s = fg / fps
                                if time_s > 0:
                                    speed_kmh = round((dist / time_s) * 3.6, 1)
                            break

                frame_data['p'].append([
                    int(p['id']),
                    round(float(p['x']), 4),
                    round(float(p['y']), 4),
                    round(float(p['w']), 4),
                    round(float(p['h']), 4),
                    int(p['team']),
                    round(float(p['hx']), 4),
                    round(float(p['hy']), 4),
                    speed_kmh  # NEW: per-frame speed in km/h
                ])

        if frame_idx in ball_lookup:
            b = ball_lookup[frame_idx]
            frame_data['b'] = [
                round(float(b['x']), 4),
                round(float(b['y']), 4),
                round(float(b['w']), 4),
                round(float(b['h']), 4),
                round(float(b['hx']), 4),
                round(float(b['hy']), 4)
            ]

        out.write(frame)
        final_json_data.append(frame_data)
        frame_idx += 1

    cap.release()
    out.release()

    print("PROGRESS:95", flush=True)

    # ── Transcode to web-compatible H.264 ──
    os.system(f"ffmpeg -y -i {output_path} -vcodec libx264 -preset fast {output_path}_web.mp4 && mv {output_path}_web.mp4 {output_path}")

    # ── Build final output JSON with analytics ──
    analytics_summary = analytics.get_analytics_summary(player_lookup, total_frames)

    output_json = {
        'frames': final_json_data,
        'analytics': analytics_summary,
        'meta': {
            'fps': fps,
            'total_frames': total_frames,
            'duration_s': round(total_frames / fps, 2),
            'resolution': f'{width}x{height}',
            'model': 'YOLO26x',
            'tracker': 'BoTSORT'
        }
    }

    with open(json_path, 'w') as f:
        json.dump(output_json, f)

    print("PROGRESS:100", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()