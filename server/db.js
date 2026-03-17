const { Pool } = require("pg");

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Crée `server/.env` (ou remplis `server/.env.example`) et ajoute une ligne DATABASE_URL=postgres://..."
    );
  }

  // Give a clearer error for a very common misconfiguration:
  // - local Postgres requires a password (especially with SCRAM auth)
  // - if the URL omits it, `pg` will crash with: "client password must be a string"
  try {
    const u = new URL(connectionString);
    const isPostgres = u.protocol === "postgres:" || u.protocol === "postgresql:";
    if (isPostgres) {
      const hasUser = Boolean(u.username);
      const hasPassword = u.password !== "";
      if (hasUser && !hasPassword) {
        throw new Error(
          "DATABASE_URL sans mot de passe. Exemple: postgres://postgres:TON_MDP@127.0.0.1:5432/skbarber (mets 127.0.0.1 pour éviter ::1)."
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && String(err.message || "").startsWith("DATABASE_URL")) throw err;
    // If URL parsing fails (special chars in password not URL-encoded, etc.), still show a helpful hint.
    throw new Error(
      "DATABASE_URL invalide. Si ton mot de passe contient des caractères spéciaux (@ : / ? #), encode-le (ex: %40 pour @)."
    );
  }

  const shouldUseSsl =
    process.env.PGSSL === "true" ||
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RENDER);

  return new Pool({
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
};

const initSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      barber TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_bookings_date_barber ON bookings(date, barber)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)"
  );

  // Prevent double booking for the same barber/date/time (except cancelled)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_slot
    ON bookings(date, time, barber)
    WHERE status != 'cancelled';
  `);
};

module.exports = { createPool, initSchema };
