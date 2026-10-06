const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

const io = new Server(server, { cors: { origin: "*" } });

const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const name = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        cb(null, name);
    }
});
const upload = multer({ storage: storage });

let pythonProcess = null;

const startAnalysis = (videoFilename, pointsStr) => {
    if (pythonProcess) pythonProcess.kill();

    const videoPath = path.join(uploadDir, videoFilename);
    const outputFilename = videoFilename.replace('.mp4', '_analyzed.mp4');
    const outputPath = path.join(outputDir, outputFilename);
    const jsonFilename = videoFilename.replace('.mp4', '.json');
    const jsonPath = path.join(outputDir, jsonFilename);

    const args = ['vision.py', videoPath, outputPath, jsonPath];
    if (pointsStr) args.push(pointsStr);

    pythonProcess = spawn('python', args);

    pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('PROGRESS:')) {
            const progressVal = output.split('PROGRESS:')[1].trim();
            io.emit('analysis-progress', parseInt(progressVal));
        }
        if (output.includes('DONE')) {
            io.emit('analysis-complete', {
                jsonUrl: `/outputs/${jsonFilename}`,
                videoUrl: `/uploads/${videoFilename}`,
                downloadUrl: `/outputs/${outputFilename}`
            });
        }
    });
    pythonProcess.stderr.on('data', (d) => console.error(`PY: ${d}`));
};

app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({error: "No file"});
    const points = req.body.points || "";
    startAnalysis(req.file.filename, points);
    res.json({ message: "Started" });
});

app.post('/demo', (req, res) => {
    const demoName = 'demo_match.mp4';
    const target = path.join(uploadDir, demoName);
    const points = req.body.points || "";

    if (!fs.existsSync(target)) {
        exec(`curl -L -o "${target}" "https://media.istockphoto.com/id/1369028350/video/professional-soccer-football-match-championship-blue-team-attacks-plays-in-pass-tries-to.mp4?s=mp4-640x640-is&k=20&c=M2f3O55hA5zO-lG7V3FjQYk-E3uJ7W1B_0_0_0_0"`, (err) => {
            startAnalysis(demoName, points);
            res.json({ message: "Demo Started" });
        });
    } else {
        startAnalysis(demoName, points);
        res.json({ message: "Demo Started" });
    }
});

server.listen(3001, () => console.log("Backend running on 3001"));