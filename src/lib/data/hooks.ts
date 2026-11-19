import { useMemo, useSyncExternalStore } from "react";
import { emptyDB, readDB, readSession, subscribe, type DB } from "./local-db";
import { scoped } from "./repo";

const serverDB = emptyDB();

export function useDB(): DB {
  return useSyncExternalStore(subscribe, readDB, () => serverDB);
}

export function useSession() {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

/** Current user, tenant and all tenant-scoped rows. Must be used inside the signed-in area. */
export function useWorkspace() {
  const db = useDB();
  const session = useSession();
  return useMemo(() => {
    const tenantId = session?.tenantId ?? "";
    const user = db.users.find((u) => u.id === session?.userId) ?? null;
    const tenant = db.tenants.find((t) => t.id === tenantId) ?? null;
    return { tenantId, user, tenant, ...scoped(db, tenantId) };
  }, [db, session]);
}
