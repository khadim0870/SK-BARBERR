const crypto = require("node:crypto");

const base64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const randomId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return base64url(crypto.randomBytes(16));
};

const nowIso = () => new Date().toISOString();

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt:${base64url(salt)}:${base64url(key)}`;
};

const verifyPassword = (password, stored) => {
  try {
    const [algo, saltB64, keyB64] = String(stored).split(":");
    if (algo !== "scrypt") return false;
    const salt = Buffer.from(saltB64.replaceAll("-", "+").replaceAll("_", "/"), "base64");
    const expected = Buffer.from(keyB64.replaceAll("-", "+").replaceAll("_", "/"), "base64");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

module.exports = { randomId, nowIso, hashPassword, verifyPassword };

