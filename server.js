// Job Tracker Dashboard Server
// Run: node server.js -> open http://localhost:3000

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'jobs.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/jobs — return all jobs from jobs.json
app.get('/api/jobs', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) {
    return res.json([]);
  }
  try {
    const jobs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(jobs);
  } catch (e) {
    console.error('Failed to read jobs.json:', e.message);
    res.status(500).json({ error: 'Could not read jobs.json' });
  }
});

// POST /api/apply — toggle applied flag for a job by its link
app.post('/api/apply', (req, res) => {
  const { link, applied } = req.body;
  if (!link) return res.status(400).json({ error: 'link is required' });

  if (!fs.existsSync(DATA_FILE)) {
    return res.status(404).json({ error: 'jobs.json not found' });
  }

  try {
    const jobs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const idx = jobs.findIndex((j) => j.link === link);

    if (idx === -1) return res.status(404).json({ error: 'Job not found' });

    jobs[idx].applied = applied;
    fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
    res.json({ ok: true, applied: jobs[idx].applied });
  } catch (e) {
    console.error('Failed to update job:', e.message);
    res.status(500).json({ error: 'Could not update jobs.json' });
  }
});

app.listen(PORT, () => {
  console.log(`Job Tracker running → http://localhost:${PORT}`);
});
