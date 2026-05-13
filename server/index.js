import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import initSqlJs from "sql.js";
import { v4 as uuidv4 } from "uuid";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = join(__dirname, "phishsim.db");

app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// ─── Database ─────────────────────────────────────────────────────────────────
const SQL = await initSqlJs();
const db = existsSync(DB_PATH) ? new SQL.Database(readFileSync(DB_PATH)) : new SQL.Database();

const save = () => writeFileSync(DB_PATH, db.export());
const run = (sql, p = []) => { db.run(sql, p); save(); };
const get = (sql, p = []) => {
  const s = db.prepare(sql); s.bind(p);
  const r = s.step() ? s.getAsObject() : undefined; s.free(); return r;
};
const all = (sql, p = []) => {
  const rows = [], s = db.prepare(sql); s.bind(p);
  while (s.step()) rows.push(s.getAsObject()); s.free(); return rows;
};

db.run(`CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  sender_name TEXT NOT NULL, sender_email TEXT NOT NULL,
  template_id TEXT NOT NULL, template_name TEXT NOT NULL,
  template_subject TEXT NOT NULL, template_body TEXT NOT NULL,
  template_lure TEXT NOT NULL, status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT (datetime('now'))
)`);
db.run(`CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL,
  department TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
  email_sent INTEGER DEFAULT 0, clicked INTEGER DEFAULT 0,
  submitted INTEGER DEFAULT 0, clicked_at DATETIME,
  submitted_at DATETIME, ip_address TEXT, user_agent TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL, target_id TEXT NOT NULL,
  event_type TEXT NOT NULL, ip_address TEXT,
  user_agent TEXT, timestamp DATETIME DEFAULT (datetime('now'))
)`);
save();

// ─── SSE Client Registry ──────────────────────────────────────────────────────
// Map<campaignId, Set<res>>  — every open SSE connection per campaign
const sseClients = new Map();

function sseAdd(campaignId, res) {
  if (!sseClients.has(campaignId)) sseClients.set(campaignId, new Set());
  sseClients.get(campaignId).add(res);
}

function sseDrop(campaignId, res) {
  sseClients.get(campaignId)?.delete(res);
}

/**
 * Broadcast a JSON event to every SSE client watching a campaign.
 * @param {string} campaignId
 * @param {string} eventName  — e.g. "click", "submit", "sent"
 * @param {object} payload
 */
function sseBroadcast(campaignId, eventName, payload) {
  const clients = sseClients.get(campaignId);
  if (!clients || clients.size === 0) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { sseDrop(campaignId, res); }
  }
  console.log(`📡 SSE [${eventName}] → ${clients.size} client(s) on campaign ${campaignId.slice(0, 8)}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const calcStats = (targets) => {
  const clicked = targets.filter(t => t.clicked).length;
  const submitted = targets.filter(t => t.submitted).length;
  const byDepartment = {};
  for (const t of targets) {
    if (!byDepartment[t.department]) byDepartment[t.department] = { total: 0, clicked: 0, submitted: 0 };
    byDepartment[t.department].total++;
    if (t.clicked) byDepartment[t.department].clicked++;
    if (t.submitted) byDepartment[t.department].submitted++;
  }
  return {
    total: targets.length,
    sent: targets.filter(t => t.email_sent).length,
    clicked, submitted,
    clickRate: targets.length ? ((clicked / targets.length) * 100).toFixed(1) : "0",
    submitRate: targets.length ? ((submitted / targets.length) * 100).toFixed(1) : "0",
    byDepartment,
  };
};

const buildEmailHtml = (body, trackUrl) => {
  const lines = body.split("\n").map(line => {
    const m = line.match(/\[(.+?)\]/);
    return m
      ? `<a href="${trackUrl}" style="display:inline-block;margin:14px 0;padding:11px 26px;background:#e63946;color:white;text-decoration:none;border-radius:4px;font-weight:600;">${m[1]}</a>`
      : `<p style="margin:7px 0;color:#333;font-size:14px;line-height:1.6;">${line || "&nbsp;"}</p>`;
  });
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:40px 0;">
<div style="max-width:560px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;">
<div style="background:#1a1a2e;padding:18px 28px;"><p style="color:#e63946;font-size:17px;font-weight:700;margin:0;">Security Notification</p></div>
<div style="padding:28px;">${lines.join("")}
<hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
<p style="font-size:11px;color:#999;">Sent by your IT security team.</p>
</div></div></body></html>`;
};

// ─── SSE Endpoint ─────────────────────────────────────────────────────────────
// GET /api/campaigns/:id/stream
// Client opens this as an EventSource — server pushes events in real time.
app.get("/api/campaigns/:id/stream", (req, res) => {
  const { id } = req.params;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send initial "connected" ping with current stats snapshot
  const targets = all("SELECT * FROM targets WHERE campaign_id=?", [id]);
  const events = all(
    `SELECT e.*,t.name as target_name,t.department
     FROM events e JOIN targets t ON e.target_id=t.id
     WHERE e.campaign_id=? ORDER BY e.timestamp DESC LIMIT 100`,
    [id]
  );
  res.write(`event: connected\ndata: ${JSON.stringify({
    stats: calcStats(targets),
    targets,
    events,
  })}\n\n`);

  // Register client
  sseAdd(id, res);
  console.log(`🔌 SSE client connected — campaign ${id.slice(0, 8)} (${sseClients.get(id)?.size} total)`);

  // Heartbeat every 25s to keep connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
  }, 25000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    sseDrop(id, res);
    console.log(`🔌 SSE client disconnected — campaign ${id.slice(0, 8)} (${sseClients.get(id)?.size ?? 0} remaining)`);
  });
});

// ─── REST Routes ──────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.get("/api/campaigns", (_, res) => {
  const campaigns = all("SELECT * FROM campaigns ORDER BY created_at DESC");
  res.json(campaigns.map(c => {
    const t = all("SELECT * FROM targets WHERE campaign_id=?", [c.id]);
    return { ...c, targets: t, stats: calcStats(t) };
  }));
});

app.get("/api/campaigns/:id", (req, res) => {
  const c = get("SELECT * FROM campaigns WHERE id=?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  const targets = all("SELECT * FROM targets WHERE campaign_id=?", [c.id]);
  const events = all(
    `SELECT e.*,t.name as target_name,t.email as target_email,t.department
     FROM events e JOIN targets t ON e.target_id=t.id
     WHERE e.campaign_id=? ORDER BY e.timestamp DESC LIMIT 200`,
    [c.id]
  );
  res.json({ ...c, targets, events, stats: calcStats(targets) });
});

app.post("/api/campaigns", (req, res) => {
  const { name, senderName, senderEmail, template, targets } = req.body;
  if (!name || !template || !targets?.length) return res.status(400).json({ error: "Missing required fields" });
  const id = uuidv4();
  run(
    "INSERT INTO campaigns (id,name,sender_name,sender_email,template_id,template_name,template_subject,template_body,template_lure) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, name, senderName, senderEmail, template.id, template.name, template.subject, template.body, template.lure]
  );
  for (const t of targets) {
    run("INSERT INTO targets (id,campaign_id,name,email,department,token) VALUES (?,?,?,?,?,?)",
      [uuidv4(), id, t.name, t.email, t.dept || t.department || "Unknown", uuidv4()]);
  }
  const c = get("SELECT * FROM campaigns WHERE id=?", [id]);
  const t2 = all("SELECT * FROM targets WHERE campaign_id=?", [id]);
  res.status(201).json({ ...c, targets: t2, stats: calcStats(t2) });
});

app.delete("/api/campaigns/:id", (req, res) => {
  run("DELETE FROM events WHERE campaign_id=?", [req.params.id]);
  run("DELETE FROM targets WHERE campaign_id=?", [req.params.id]);
  run("DELETE FROM campaigns WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/campaigns/:id/send", async (req, res) => {
  const campaign = get("SELECT * FROM campaigns WHERE id=?", [req.params.id]);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  const targets = all("SELECT * FROM targets WHERE campaign_id=?", [campaign.id]);
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  let transport;
  if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    const acc = await nodemailer.createTestAccount();
    transport = nodemailer.createTransport({ host: "smtp.ethereal.email", port: 587, auth: { user: acc.user, pass: acc.pass } });
  }

  const results = [];
  for (const t of targets) {
    const trackUrl = `${baseUrl}/track/${t.token}`;
    const body = campaign.template_body.replace("{name}", t.name).replace("{sender}", campaign.sender_name);
    const subject = campaign.template_subject.replace("{sender}", campaign.sender_name);
    try {
      const info = await transport.sendMail({
        from: `"${campaign.sender_name}" <${campaign.sender_email}>`,
        to: t.email, subject, html: buildEmailHtml(body, trackUrl),
      });
      run("UPDATE targets SET email_sent=1 WHERE id=?", [t.id]);
      run("INSERT INTO events (campaign_id,target_id,event_type) VALUES (?,?,?)", [campaign.id, t.id, "sent"]);

      // Broadcast "sent" event to SSE clients
      sseBroadcast(campaign.id, "sent", {
        target: { id: t.id, name: t.name, email: t.email, department: t.department },
        stats: calcStats(all("SELECT * FROM targets WHERE campaign_id=?", [campaign.id])),
        timestamp: new Date().toISOString(),
        preview: nodemailer.getTestMessageUrl(info) || null,
      });

      results.push({ target: t.email, status: "sent", preview: nodemailer.getTestMessageUrl(info) || null });
    } catch (e) {
      results.push({ target: t.email, status: "failed", error: e.message });
    }
  }
  res.json({ sent: results.filter(r => r.status === "sent").length, failed: results.filter(r => r.status === "failed").length, results });
});

app.get("/api/campaigns/:id/events", (req, res) => {
  res.json(all(
    `SELECT e.*,t.name as target_name,t.email as target_email,t.department
     FROM events e JOIN targets t ON e.target_id=t.id
     WHERE e.campaign_id=? ORDER BY e.timestamp DESC LIMIT 200`,
    [req.params.id]
  ));
});

app.get("/api/campaigns/:id/stats", (req, res) => {
  res.json(calcStats(all("SELECT * FROM targets WHERE campaign_id=?", [req.params.id])));
});

// Sandbox simulate click — also broadcasts SSE
app.post("/api/campaigns/:id/simulate-click", (req, res) => {
  const t = get("SELECT * FROM targets WHERE id=? AND campaign_id=?", [req.body.targetId, req.params.id]);
  if (!t) return res.status(404).json({ error: "Not found" });
  if (!t.clicked) {
    run("UPDATE targets SET clicked=1,clicked_at=datetime('now') WHERE id=?", [t.id]);
    run("INSERT INTO events (campaign_id,target_id,event_type) VALUES (?,?,?)", [req.params.id, t.id, "click"]);
  }
  const updated = get("SELECT * FROM targets WHERE id=?", [t.id]);
  const allTargets = all("SELECT * FROM targets WHERE campaign_id=?", [req.params.id]);

  // SSE broadcast
  sseBroadcast(req.params.id, "click", {
    target: updated,
    stats: calcStats(allTargets),
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, target: updated });
});

// Sandbox simulate submit — also broadcasts SSE
app.post("/api/campaigns/:id/simulate-submit", (req, res) => {
  const t = get("SELECT * FROM targets WHERE id=? AND campaign_id=?", [req.body.targetId, req.params.id]);
  if (!t) return res.status(404).json({ error: "Not found" });
  if (!t.clicked) run("UPDATE targets SET clicked=1,clicked_at=datetime('now') WHERE id=?", [t.id]);
  run("UPDATE targets SET submitted=1,submitted_at=datetime('now') WHERE id=?", [t.id]);
  run("INSERT INTO events (campaign_id,target_id,event_type) VALUES (?,?,?)", [req.params.id, t.id, "submit"]);
  const updated = get("SELECT * FROM targets WHERE id=?", [t.id]);
  const allTargets = all("SELECT * FROM targets WHERE campaign_id=?", [req.params.id]);

  // SSE broadcast
  sseBroadcast(req.params.id, "submit", {
    target: updated,
    stats: calcStats(allTargets),
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, target: updated });
});

// ─── Real tracking routes (email link clicks) ─────────────────────────────────
app.get("/track/:token", (req, res) => {
  const t = get("SELECT * FROM targets WHERE token=?", [req.params.token]);
  if (!t) return res.status(404).send("Not found");
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const ua = req.headers["user-agent"];

  if (!t.clicked) {
    run("UPDATE targets SET clicked=1,clicked_at=datetime('now'),ip_address=?,user_agent=? WHERE id=?", [ip, ua, t.id]);
    run("INSERT INTO events (campaign_id,target_id,event_type,ip_address,user_agent) VALUES (?,?,?,?,?)",
      [t.campaign_id, t.id, "click", ip, ua]);

    const updated = get("SELECT * FROM targets WHERE id=?", [t.id]);
    const allTargets = all("SELECT * FROM targets WHERE campaign_id=?", [t.campaign_id]);

    // 🔴 REAL-TIME: push click event to all dashboard SSE clients immediately
    sseBroadcast(t.campaign_id, "click", {
      target: updated,
      stats: calcStats(allTargets),
      timestamp: new Date().toISOString(),
      ip,
      userAgent: ua,
    });
  }

  const c = get("SELECT * FROM campaigns WHERE id=?", [t.campaign_id]);
  res.send(harvestPage(t.token, c?.sender_name || "IT Security"));
});

app.post("/track/:token/submit", (req, res) => {
  const t = get("SELECT * FROM targets WHERE token=?", [req.params.token]);
  if (!t) return res.status(404).json({ error: "Not found" });
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const ua = req.headers["user-agent"];

  if (!t.clicked) {
    run("UPDATE targets SET clicked=1,clicked_at=datetime('now') WHERE id=?", [t.id]);
    run("INSERT INTO events (campaign_id,target_id,event_type,ip_address,user_agent) VALUES (?,?,?,?,?)",
      [t.campaign_id, t.id, "click", ip, ua]);
  }
  run("UPDATE targets SET submitted=1,submitted_at=datetime('now') WHERE id=?", [t.id]);
  run("INSERT INTO events (campaign_id,target_id,event_type,ip_address,user_agent) VALUES (?,?,?,?,?)",
    [t.campaign_id, t.id, "submit", ip, ua]);

  const updated = get("SELECT * FROM targets WHERE id=?", [t.id]);
  const allTargets = all("SELECT * FROM targets WHERE campaign_id=?", [t.campaign_id]);

  // 🔴 REAL-TIME: push submit event to all dashboard SSE clients immediately
  sseBroadcast(t.campaign_id, "submit", {
    target: updated,
    stats: calcStats(allTargets),
    timestamp: new Date().toISOString(),
    ip,
  });

  res.json({ success: true });
  // Note: credential values intentionally NOT stored
});

// ─── Harvest page ─────────────────────────────────────────────────────────────
function harvestPage(token, org) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sign In — ${org}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem;}
    .card{background:white;border-radius:12px;padding:40px;width:100%;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1);}
    .logo{text-align:center;margin-bottom:20px;font-size:20px;font-weight:700;color:#1a1a2e;}
    .logo span{color:#e63946;}
    .sub{text-align:center;font-size:13px;color:#666;margin-bottom:4px;}
    label{display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:5px;margin-top:14px;}
    input{width:100%;padding:10px 13px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;outline:none;transition:border-color .15s;}
    input:focus{border-color:#e63946;}
    .submit-btn{width:100%;margin-top:20px;padding:12px;background:#e63946;color:white;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;}
    .submit-btn:hover{background:#c1121f;}
    .footer{text-align:center;font-size:11px;color:#aaa;margin-top:16px;}
    #caught{display:none;text-align:center;}
    #caught .icon{font-size:52px;margin-bottom:12px;}
    #caught h2{color:#e63946;font-size:22px;margin-bottom:10px;}
    #caught p{color:#555;font-size:13px;line-height:1.8;}
    #caught ul{text-align:left;margin:12px 0;padding-left:20px;color:#555;font-size:13px;line-height:2;}
  </style>
</head>
<body>
  <div class="card">
    <div id="login-form">
      <div class="logo">🔐 <span>Secure</span>Portal</div>
      <p class="sub">Your session has expired.</p>
      <p class="sub">Please verify your identity to continue.</p>
      <label>Email address</label>
      <input type="email" id="u" placeholder="you@company.com" autocomplete="email">
      <label>Password</label>
      <input type="password" id="p" placeholder="••••••••" autocomplete="current-password">
      <button class="submit-btn" onclick="submitCreds()">Sign In →</button>
      <div class="footer">🔒 SSL Secured · IT Security Team</div>
    </div>
    <div id="caught">
      <div class="icon">🛑</div>
      <h2>You've been phished!</h2>
      <p>This was a <strong>simulated phishing test</strong> conducted by your organization's security team.</p>
      <ul>
        <li>Always verify the sender before clicking links</li>
        <li>Check the URL before entering any credentials</li>
        <li>Report suspicious emails to your security team</li>
        <li>Complete your security awareness training module</li>
      </ul>
      <p>Your security team has been notified of this result.</p>
    </div>
  </div>
  <script>
    async function submitCreds() {
      const u = document.getElementById('u').value.trim();
      const p = document.getElementById('p').value;
      if (!u || !p) { alert('Please fill in all fields.'); return; }
      try {
        await fetch('/track/${token}/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch(e) {}
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('caught').style.display = 'block';
    }
    // Also submit on Enter key
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitCreds();
    });
  </script>
</body>
</html>`;
}

// ─── Gemini Report Generation ─────────────────────────────────────────────────
app.post("/api/generate-report", async (req, res) => {
  const { stats, campaignName, prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Attempt AI Generation
  if (apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
          }),
        }
      );

      if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return res.json({ text }); // Success: Send AI Report
        }
    } catch (e) {
        console.error("AI Error, falling back to Local Analysis:", e.message);
    }

  // 2. Intelligent Local Fallback (Interviewer-Ready Logic)
  // This generates a dynamic report based on actual campaign data
  const topDept = Object.entries(stats?.byDepartment || {})
    .sort(([, a], [, b]) => (b.clicked / b.total) - (a.clicked / a.total))[0];

  const riskLevel = stats?.clickRate > 20 ? "🔴 CRITICAL" : "🟡 MODERATE";

  const localReport = `
## 📊 EXECUTIVE SECURITY ANALYSIS: ${campaignName?.toUpperCase() || "CAMPAIGN"}
*Generated via Local Heuristics Engine*

### **Security Posture: ${riskLevel}**
Organization-wide susceptibility is currently at **${stats?.clickRate || 0}%**. This indicates a significant vulnerability to social engineering tactics.

### **Target Analysis**
- **Primary Risk Group:** The **${topDept ? topDept[0] : "General"}** department exhibited the highest engagement with the simulation.
- **Compromise Depth:** ${stats?.submitted || 0} individuals proceeded to share credentials, highlighting a need for stronger endpoint identity protection.

### **Strategic Recommendations**
1. **Targeted Training:** Conduct an immediate workshop for the ${topDept ? topDept[0] : "identified"} team focusing on URL inspection.
2. **Technical Control:** Enable Multi-Factor Authentication (MFA) to mitigate the impact of the ${stats?.submitted || 0} potentially leaked credentials.
3. **Lure Awareness:** The urgency used in this simulation was highly effective; future training should emphasize "Pressure Tactics" detection.
  `;

  res.json({ text: localReport });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
🎣 PhishSim Server  →  http://localhost:${PORT}
📡 SSE endpoint     →  GET /api/campaigns/:id/stream
🗄️  Database        →  ${DB_PATH}
📧 SMTP             →  ${process.env.SMTP_HOST || "Ethereal test (no config)"}
  `);
});
