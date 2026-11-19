/**
 * PROTOTYPE authentication: accounts live only in this browser's storage.
 * Passwords are salted + PBKDF2-hashed, but this is not real security — anyone with
 * access to the device can read local data. Replace with server auth before production.
 */
import { newId, nowISO, readDB, readSession, writeDB, writeSession, type Session } from "./local-db";

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<Session> {
  const db = readDB();
  if (db.users.some((u) => u.email === input.email)) {
    throw new Error("Bu e-posta ile bir hesap zaten var. Giriş yapmayı deneyin.");
  }
  const userId = newId();
  const tenantId = newId();
  const salt = newId();
  const passwordHash = await hashPassword(input.password, salt);
  writeDB((d) => ({
    ...d,
    users: [
      ...d.users,
      { id: userId, email: input.email, name: input.name, passwordHash, salt, tenantId, createdAt: nowISO() },
    ],
    tenants: [...d.tenants, { id: tenantId, name: input.companyName, ownerId: userId, createdAt: nowISO() }],
  }));
  const session = { userId, tenantId, createdAt: nowISO() };
  writeSession(session);
  return session;
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  const user = readDB().users.find((u) => u.email === input.email);
  const hash = user ? await hashPassword(input.password, user.salt) : null;
  if (!user || hash !== user.passwordHash) throw new Error("E-posta veya şifre hatalı");
  const session = { userId: user.id, tenantId: user.tenantId, createdAt: nowISO() };
  writeSession(session);
  return session;
}

export function signOut() {
  writeSession(null);
}

export function currentSession(): Session | null {
  const s = readSession();
  if (!s) return null;
  // Session must point to an existing user/tenant pair.
  const user = readDB().users.find((u) => u.id === s.userId && u.tenantId === s.tenantId);
  return user ? s : null;
}
