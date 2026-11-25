/**
 * Supabase Auth is the source of truth for accounts and sessions.
 * Existing business records remain in the browser database until the user explicitly
 * imports them into the cloud workspace. Matching legacy accounts by e-mail preserves
 * their local tenant ID and all associated records.
 */
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@/lib/domain/types";
import { nowISO, readDB, readSession, writeDB, writeSession, type Session } from "./local-db";

type WorkspaceIdentity = {
  userId: string;
  organizationId: string;
  organizationName: string;
  fullName: string;
  createdAt: string;
};

function turkishAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (normalized.includes("email not confirmed")) return "E-posta adresinizi doğrulamanız gerekiyor.";
  if (normalized.includes("user already registered")) return "Bu e-posta ile bir hesap zaten var. Giriş yapmayı deneyin.";
  if (normalized.includes("password should be at least")) return "Şifre en az 8 karakter olmalı.";
  if (normalized.includes("rate limit")) return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.";
  return message;
}

async function getWorkspaceIdentity(authUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): Promise<WorkspaceIdentity> {
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, created_at")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError) throw new Error("Çalışma alanı üyeliği okunamadı: " + membershipError.message);
  const membership = memberships?.[0];
  if (!membership?.organization_id) {
    throw new Error("Hesabınız açıldı ancak çalışma alanı henüz oluşturulmadı. Birkaç saniye sonra tekrar giriş yapın.");
  }

  const [{ data: organization, error: organizationError }, { data: profile }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, created_at")
      .eq("id", membership.organization_id)
      .single(),
    supabase.from("profiles").select("full_name").eq("id", authUser.id).maybeSingle(),
  ]);

  if (organizationError || !organization) {
    throw new Error("Çalışma alanı bilgileri okunamadı: " + (organizationError?.message ?? "Kayıt bulunamadı"));
  }

  const email = authUser.email?.trim().toLowerCase() ?? "";
  const rawMetaName = authUser.user_metadata?.["full_name"];
  const metadataName = typeof rawMetaName === "string" ? rawMetaName : "";
  const fullName = profile?.full_name?.trim() || metadataName.trim() || email.split("@")[0] || "Kullanıcı";

  return {
    userId: authUser.id,
    organizationId: organization.id,
    organizationName: organization.name,
    fullName,
    createdAt: organization.created_at || nowISO(),
  };
}

function cacheWorkspaceIdentity(identity: WorkspaceIdentity, emailInput: string): Session {
  const email = emailInput.trim().toLowerCase();
  const db = readDB();
  const legacyUser = db.users.find((item) => item.email.trim().toLowerCase() === email);
  const localUserId = legacyUser?.id ?? identity.userId;
  const localTenantId = legacyUser?.tenantId ?? identity.organizationId;
  const now = nowISO();

  const user: User = {
    id: localUserId,
    email,
    name: identity.fullName,
    // Supabase owns the password. Never store a password or password hash in the app database.
    passwordHash: "",
    salt: "",
    tenantId: localTenantId,
    createdAt: legacyUser?.createdAt ?? now,
  };

  writeDB((current) => {
    const existingTenant = current.tenants.find((item) => item.id === localTenantId);
    return {
      ...current,
      users: [...current.users.filter((item) => item.id !== localUserId), user],
      tenants: [
        ...current.tenants.filter((item) => item.id !== localTenantId),
        {
          id: localTenantId,
          name: existingTenant?.name || identity.organizationName,
          ownerId: localUserId,
          createdAt: existingTenant?.createdAt ?? identity.createdAt,
        },
      ],
    };
  });

  const session: Session = {
    userId: localUserId,
    tenantId: localTenantId,
    cloudUserId: identity.userId,
    cloudOrganizationId: identity.organizationId,
    authProvider: "supabase",
    createdAt: now,
  };
  writeSession(session);
  return session;
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<{ session: Session | null; confirmationRequired: boolean }> {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      // Supabase must allow the Vercel preview and production origins in Auth > URL Configuration.
      ...(typeof window !== "undefined" ? { emailRedirectTo: `${window.location.origin}/giris` } : {}),
      data: {
        full_name: input.name.trim(),
        company_name: input.companyName.trim(),
      },
    },
  });

  if (error) throw new Error(turkishAuthError(error.message));
  if (!data.user) throw new Error("Hesap oluşturulamadı. Lütfen tekrar deneyin.");

  // Supabase projects with e-mail confirmation enabled return no session here.
  if (!data.session) {
    return { session: null, confirmationRequired: true };
  }

  const identity = await getWorkspaceIdentity(data.user);
  return {
    session: cacheWorkspaceIdentity(identity, email),
    confirmationRequired: false,
  };
}

export async function signIn(input: { email: string; password: string }): Promise<Session> {
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) throw new Error(turkishAuthError(error.message));
  if (!data.user) throw new Error("Giriş yapılamadı. E-posta ve şifrenizi kontrol edin.");

  const identity = await getWorkspaceIdentity(data.user);
  return cacheWorkspaceIdentity(identity, email);
}

/** Revalidates the real Supabase session before protected routes are opened. */
export async function restoreSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    writeSession(null);
    return null;
  }

  const cached = readSession();
  if (
    cached?.authProvider === "supabase" &&
    cached.cloudUserId === data.user.id &&
    cached.cloudOrganizationId
  ) {
    const localUser = readDB().users.find((item) => item.id === cached.userId);
    if (localUser && localUser.tenantId === cached.tenantId) return cached;
  }

  const identity = await getWorkspaceIdentity(data.user);
  return cacheWorkspaceIdentity(identity, data.user.email ?? "");
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  writeSession(null);
  if (error) throw new Error(turkishAuthError(error.message));
}

/** Synchronous cache for components; protected routes use restoreSession() first. */
export function currentSession(): Session | null {
  const session = readSession();
  if (!session || session.authProvider !== "supabase" || !session.cloudUserId) return null;
  const user = readDB().users.find((item) => item.id === session.userId && item.tenantId === session.tenantId);
  return user ? session : null;
}
