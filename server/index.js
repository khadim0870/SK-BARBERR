const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const { createPool, initSchema } = require("./db");
const { randomId, nowIso, hashPassword, verifyPassword } = require("./security");

// Load env from `server/.env` if present, otherwise fall back to `server/.env.example`
// (useful in local dev when the user only has `.env.example`).
const envPath = fs.existsSync(path.join(__dirname, ".env"))
  ? path.join(__dirname, ".env")
  : path.join(__dirname, ".env.example");
dotenv.config({ path: envPath });

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "admin@skbarber.local").toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "ChangeMe123!");
const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

// Serve frontend from project root (avoid file:// issues)
const projectRoot = path.join(__dirname, "..");

const pool = createPool();

const latestHeroVideoFromAssets = () => {
  try {
    const dir = path.join(projectRoot, "assets", "videos");
    const names = fs.readdirSync(dir, { withFileTypes: true });
    const matches = [];
    for (const e of names) {
      if (!e.isFile()) continue;
      const m = /^wa-(\d{3})\.mp4$/i.exec(e.name);
      if (m) matches.push({ n: Number(m[1]), name: e.name });
    }
    if (matches.length) {
      matches.sort((a, b) => a.n - b.n);
      return matches[matches.length - 1].name;
    }
  } catch {
    // ignore
  }
  return "wa-001.mp4";
};

const ensureDefaultSettings = async () => {
  const updatedAt = nowIso();
  const latest = latestHeroVideoFromAssets();
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1,$2,$3)
     ON CONFLICT (key) DO NOTHING`,
    ["heroVideoSrc", latest, updatedAt]
  );

  // If still on old placeholder, update to latest clip (doesn't overwrite custom admin choice)
  await pool.query(
    "UPDATE settings SET value = $1, updated_at = $2 WHERE key = $3 AND value = $4",
    [latest, updatedAt, "heroVideoSrc", "wa-001.mp4"]
  );
};

const ensureAdminUser = async () => {
  const existing = await pool.query(
    "SELECT id, email, role FROM users WHERE email = $1 LIMIT 1",
    [ADMIN_EMAIL]
  );
  if (existing.rows[0]) return;

  const admin = {
    id: randomId(),
    first_name: "Admin",
    last_name: "SK",
    name: "Admin SK",
    email: ADMIN_EMAIL,
    phone: "0000000000",
    password_hash: hashPassword(ADMIN_PASSWORD),
    role: "admin",
    created_at: nowIso(),
  };

  await pool.query(
    `INSERT INTO users (id, first_name, last_name, name, email, phone, password_hash, role, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      admin.id,
      admin.first_name,
      admin.last_name,
      admin.name,
      admin.email,
      admin.phone,
      admin.password_hash,
      admin.role,
      admin.created_at,
    ]
  );
};

const app = express();
app.use(express.json({ limit: "256kb" }));

// Dev CORS: allow calls from Live Server (localhost/127.0.0.1) to the API on :3000
if (!IS_PROD) {
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "");
    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });
}

// Lightweight healthcheck (no DB) for uptime monitors
app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ ok: true, db: true, time: nowIso() });
  } catch (err) {
    return res.status(500).json({ ok: false, db: false, time: nowIso() });
  }
});

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
};

const adminRequired = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  return next();
};

app.use("/assets", express.static(path.join(projectRoot, "assets")));
app.get("/", (req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(projectRoot, "admin.html")));
app.get("/admin", (req, res) => res.redirect(302, "/admin.html"));
app.get("/style.css", (req, res) => res.sendFile(path.join(projectRoot, "style.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(projectRoot, "script.js")));
app.get("/admin.js", (req, res) => res.sendFile(path.join(projectRoot, "admin.js")));

// Public settings (no auth)
app.get("/api/public/settings", async (req, res) => {
  const row = await pool.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", ["heroVideoSrc"]);
  const heroVideoSrc = row.rows[0]?.value || "wa-001.mp4";
  return res.json({ heroVideoSrc });
});

// Admin settings
app.patch("/api/admin/settings/hero-video", authRequired, adminRequired, async (req, res) => {
  const src = String(req.body?.src || "").trim();
  if (!src || !src.toLowerCase().endsWith(".mp4")) {
    return res.status(400).json({ error: "invalid_src" });
  }

  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    ["heroVideoSrc", src, nowIso()]
  );

  return res.json({ ok: true });
});

const getUserByEmail = async (email) => {
  const row = await pool.query(
    "SELECT id, name, email, phone, password_hash, role FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return row.rows[0] || null;
};

const respondClientAuth = (res, user, mode) => {
  const token = signToken(user);
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    mode,
  });
};

// Client login: email + mot de passe
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  if (user.role !== "client") return res.status(403).json({ error: "not_a_client" });
  return respondClientAuth(res, user, "login");
});

// Client register: infos + mot de passe
app.post("/api/auth/register", async (req, res) => {
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!firstName || !lastName || !phone || !email || !password) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (password.length < 6) return res.status(400).json({ error: "weak_password" });

  const existing = await getUserByEmail(email);
  if (existing) return res.status(409).json({ error: "email_exists" });

  const user = {
    id: randomId(),
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    email,
    phone,
    password_hash: hashPassword(password),
    role: "client",
    created_at: nowIso(),
  };

  await pool.query(
    `INSERT INTO users (id, first_name, last_name, name, email, phone, password_hash, role, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      user.id,
      user.first_name,
      user.last_name,
      user.name,
      user.email,
      user.phone,
      user.password_hash,
      user.role,
      user.created_at,
    ]
  );

  return respondClientAuth(res, user, "register");
});

// Auth: legacy "continue" endpoint (login with email+password, register if new)
app.post("/api/auth/continue", async (req, res) => {
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    if (!verifyPassword(password, existingUser.password_hash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    if (existingUser.role !== "client") {
      return res.status(403).json({ error: "not_a_client" });
    }
    return respondClientAuth(res, existingUser, "login");
  }

  // New account creation requires extra fields
  if (!firstName || !lastName || !phone) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (password.length < 6) return res.status(400).json({ error: "weak_password" });

  const user = {
    id: randomId(),
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    email,
    phone,
    password_hash: hashPassword(password),
    role: "client",
    created_at: nowIso(),
  };

  try {
    await pool.query(
      `INSERT INTO users (id, first_name, last_name, name, email, phone, password_hash, role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        user.id,
        user.first_name,
        user.last_name,
        user.name,
        user.email,
        user.phone,
        user.password_hash,
        user.role,
        user.created_at,
      ]
    );
  } catch {
    return res.status(409).json({ error: "email_exists" });
  }

  return respondClientAuth(res, user, "register");
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const row = await pool.query(
    "SELECT id, name, email, password_hash, role FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  const admin = row.rows[0];
  if (!admin || admin.role !== "admin") return res.status(401).json({ error: "invalid_credentials" });
  if (!verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = signToken(admin);
  return res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
});

// Availability: get already booked times for a date (+ optional barber)
app.get("/api/bookings/availability", async (req, res) => {
  const date = String(req.query?.date || "").trim();
  const barber = String(req.query?.barber || "").trim();
  if (!date) return res.status(400).json({ error: "missing_date" });

  const rows = barber
    ? await pool.query(
        "SELECT time FROM bookings WHERE date = $1 AND barber = $2 AND status != 'cancelled' ORDER BY time ASC",
        [date, barber]
      )
    : await pool.query(
        "SELECT time FROM bookings WHERE date = $1 AND status != 'cancelled' ORDER BY time ASC",
        [date]
      );

  return res.json({ booked: rows.rows.map((r) => r.time) });
});

// Create booking (client)
app.post("/api/bookings", authRequired, async (req, res) => {
  if (req.user.role !== "client") return res.status(403).json({ error: "forbidden" });

  const service = String(req.body?.service || "").trim();
  const barber = String(req.body?.barber || "").trim();
  const date = String(req.body?.date || "").trim();
  const time = String(req.body?.time || "").trim();
  const notes = String(req.body?.notes || "").trim();

  if (!service || !barber || !date || !time) return res.status(400).json({ error: "missing_fields" });

  const booking = {
    id: randomId(),
    user_id: req.user.sub,
    service,
    barber,
    date,
    time,
    notes: notes || null,
    status: "pending",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  try {
    await pool.query(
      `INSERT INTO bookings (id, user_id, service, barber, date, time, notes, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        booking.id,
        booking.user_id,
        booking.service,
        booking.barber,
        booking.date,
        booking.time,
        booking.notes,
        booking.status,
        booking.created_at,
        booking.updated_at,
      ]
    );
  } catch (err) {
    // Unique index violation (slot already taken)
    if (err && String(err.code) === "23505") {
      return res.status(409).json({ error: "slot_taken" });
    }
    return res.status(500).json({ error: "server_error" });
  }

  return res.json({ ok: true, bookingId: booking.id });
});

// My bookings (client)
app.get("/api/bookings/me", authRequired, async (req, res) => {
  if (req.user.role !== "client") return res.status(403).json({ error: "forbidden" });

  const rows = await pool.query(
    `SELECT id, service, barber, date, time, status, created_at, updated_at
     FROM bookings
     WHERE user_id = $1
     ORDER BY date DESC, time DESC`,
    [req.user.sub]
  );

  return res.json({ bookings: rows.rows });
});

// Admin: list bookings
app.get("/api/admin/bookings", authRequired, adminRequired, async (req, res) => {
  const rows = await pool.query(
    `SELECT b.id, b.service, b.barber, b.date, b.time, b.status, b.created_at, b.updated_at,
            u.name AS client_name, u.email AS client_email, u.phone AS client_phone
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     ORDER BY b.date ASC, b.time ASC`
  );
  return res.json({ bookings: rows.rows });
});

// Admin: update status
app.patch("/api/admin/bookings/:id", authRequired, adminRequired, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const status = String(req.body?.status || "").trim();
  const allowed = new Set(["pending", "confirmed", "cancelled"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "invalid_status" });

  try {
    const updated = await pool.query(
      "UPDATE bookings SET status = $1, updated_at = $2 WHERE id = $3",
      [status, nowIso(), id]
    );
    if (!updated.rowCount) return res.status(404).json({ error: "not_found" });
  } catch (err) {
    if (err && String(err.code) === "23505") {
      return res.status(409).json({ error: "slot_taken" });
    }
    return res.status(500).json({ error: "server_error" });
  }

  return res.json({ ok: true });
});

// Admin: delete booking
app.delete("/api/admin/bookings/:id", authRequired, adminRequired, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const deleted = await pool.query("DELETE FROM bookings WHERE id = $1", [id]);
  if (!deleted.rowCount) return res.status(404).json({ error: "not_found" });
  return res.json({ ok: true });
});

const start = async () => {
  await initSchema(pool);
  await ensureDefaultSettings();
  await ensureAdminUser();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`MANOIR DES CHEVEUX server running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Admin: ${ADMIN_EMAIL} (set in server/.env)`);
  });
};

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err?.message || err);
  process.exit(1);
});
