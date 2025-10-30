const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();
const fetch = require('node-fetch'); // npm install node-fetch@2

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const db = new Database(path.join(ROOT, 'data.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  image_url TEXT,
  label TEXT,
  estimated_age TEXT,
  confidence REAL,
  raw_response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// simple storage (multer writes temp files; we'll rename)
const upload = multer({ dest: UPLOAD_DIR });

// serve frontend and uploads
app.use(express.static(ROOT));
app.use('/uploads', express.static(UPLOAD_DIR));

// simple CORS for dev if needed
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Analyze endpoint: accepts multipart form 'photo'
app.post('/api/analyze', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // create stable filename
    const ext = path.extname(req.file.originalname) || '.png';
    const unique = `${Date.now()}-${Math.floor(Math.random()*1e6)}${ext}`;
    const dest = path.join(UPLOAD_DIR, unique);
    fs.renameSync(req.file.path, dest);

    const buffer = fs.readFileSync(dest);
    const imageBase64 = buffer.toString('base64');

    const instruction = `You are an expert archaeological analyst. Given the image, return a JSON object with keys:
{"label":"short label","estimated_age":"human-readable date range","confidence":0-1,"notes":"optional"}
Return valid JSON only.`;

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not set in .env' });
    }

    // Adjust model name / endpoint as needed for your Groq setup
    const groqEndpoint = 'https://api.groq.cloud/v1/infer';
    const payload = {
      model: 'your-multimodal-model', // <- replace with your model name
      input: {
        image_base64: imageBase64,
        instruction
      }
    };

    const groqResp = await fetch(groqEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const groqJson = await groqResp.json();

    // try to parse JSON text returned by model
    let parsed = { label: null, estimated_age: null, confidence: null, notes: null };
    try {
      const text = (typeof groqJson.output === 'string') ? groqJson.output : JSON.stringify(groqJson);
      const maybe = JSON.parse(text);
      parsed = { ...parsed, ...maybe };
    } catch (e) {
      parsed.notes = JSON.stringify(groqJson);
    }

    const imageUrl = `/uploads/${unique}`;
    const insert = db.prepare(`INSERT INTO observations (filename, image_url, label, estimated_age, confidence, raw_response) VALUES (?,?,?,?,?,?)`);
    const info = insert.run(path.basename(dest), imageUrl, parsed.label, parsed.estimated_age, parsed.confidence, JSON.stringify(groqJson));

    res.json({
      id: info.lastInsertRowid,
      filename: path.basename(dest),
      imageUrl,
      label: parsed.label,
      estimated_age: parsed.estimated_age,
      confidence: parsed.confidence,
      raw_response: parsed.notes || groqJson
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// list observations
app.get('/api/observations', (req, res) => {
  const rows = db.prepare('SELECT * FROM observations ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));