/**
 * Local-first workspace cache.
 * Supabase Auth validates accounts; business rows remain here until explicitly imported.
 * Keep this copy intact during cloud migration so older browser data can be recovered.
 */
import type {
  Expense,
  OrderRecord,
  Product,
  ReconciliationEntry,
  Store,
  Tenant,
  User,
} from "@/lib/domain/types";

export interface DB {
  version: 1;
  users: User[];
  tenants: Tenant[];
  stores: Store[];
  products: Product[];
  orders: OrderRecord[];
  expenses: Expense[];
  reconciliations: ReconciliationEntry[];
}

export interface Session {
  /** Local identity retained to keep existing browser-only business records intact. */
  userId: string;
  tenantId: string;
  /** Verified Supabase Auth identity and cloud organization. */
  cloudUserId?: string;
  cloudOrganizationId?: string;
  authProvider?: "supabase";
  createdAt: string;
}

const DB_KEY = "sbc:v1:db";
const SESSION_KEY = "sbc:v1:session";

export const emptyDB = (): DB => ({
  version: 1,
  users: [],
  tenants: [],
  stores: [],
  products: [],
  orders: [],
  expenses: [],
  reconciliations: [],
});

let dbCache: DB | null = null;
let sessionCache: Session | null | undefined;
const listeners = new Set<() => void>();

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readDB(): DB {
  if (dbCache) return dbCache;
  if (!hasStorage()) return (dbCache = emptyDB());
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    const parsed = raw ? (JSON.parse(raw) as DB) : null;
    dbCache = parsed && parsed.version === 1 ? { ...emptyDB(), ...parsed } : emptyDB();
  } catch {
    dbCache = emptyDB();
  }
  return dbCache;
}

/** Immutable update: produce a new DB object so subscribers re-render. */
export function writeDB(update: (db: DB) => DB): DB {
  const next = update(readDB());
  dbCache = next;
  if (hasStorage()) window.localStorage.setItem(DB_KEY, JSON.stringify(next));
  emit();
  return next;
}

export function readSession(): Session | null {
  if (sessionCache !== undefined) return sessionCache;
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    sessionCache = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    sessionCache = null;
  }
  return sessionCache;
}

export function writeSession(session: Session | null) {
  sessionCache = session;
  if (hasStorage()) {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  }
  emit();
}

/** Test helper / "reset" support. */
export function __resetForTests(db: DB = emptyDB()) {
  dbCache = db;
  sessionCache = null;
  if (hasStorage()) {
    window.localStorage.removeItem(DB_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const nowISO = () => new Date().toISOString();
