const { Pool } = require("pg");

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
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

