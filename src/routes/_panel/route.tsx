import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { Info } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app/AppSidebar";
import { FiltersProvider } from "@/components/app/filters";
import { restoreSession } from "@/lib/data/auth";
import { startAutomaticProductSync } from "@/lib/data/automatic-product-sync";
import { startAutomaticStoreSync } from "@/lib/data/automatic-store-sync";
import { startAutomaticRecordSync } from "@/lib/data/automatic-record-sync";
import { syncWorkspaceWithCloud } from "@/lib/data/cloud-sync";
import { readSession } from "@/lib/data/local-db";

export const Route = createFileRoute("/_panel")({
  // Supabase client session is currently browser-managed; validate it before rendering this area.
  ssr: false,
  beforeLoad: async ({ location }) => {
    let session = null;
    try {
      session = await restoreSession();
    } catch (error) {
      console.error("[Auth] Session validation failed", error);
    }
    if (!session) {
      throw redirect({ to: "/giris", search: { redirect: location.href } });
    }
  },
  component: PanelLayout,
});

function PanelLayout() {
  useEffect(() => {
    let stopped = false;
    let stopProductSync = () => {};
    let stopStoreSync = () => {};
    let stopRecordSync = () => {};

    async function initializeCloudData() {
      const session = readSession();
      if (session?.cloudOrganizationId && session.authProvider === "supabase") {
        const marker = "sbc:v1:cloud-sync:" + session.tenantId;
        if (!window.localStorage.getItem(marker)) {
          try {
            // First login on a browser/preview automatically downloads the existing
            // cloud workspace before report pages read the local cache.
            await syncWorkspaceWithCloud();
          } catch (error) {
            console.error("[AutoSync] Initial cloud download failed:", error);
          }
        }
      }

      if (stopped) return;
      stopProductSync = startAutomaticProductSync();
      stopStoreSync = startAutomaticStoreSync();
      stopRecordSync = startAutomaticRecordSync();
    }

    void initializeCloudData();
    return () => {
      stopped = true;
      stopProductSync();
      stopStoreSync();
      stopRecordSync();
    };
  }, []);

  return (
    <SidebarProvider>
      <FiltersProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="bg-background">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0 text-warning" />
                <span className="truncate">
                  İlk tam eşitlemeden sonra mağazalar, ürünler, siparişler, giderler ve mutabakatlar otomatik eşitlenir
                </span>
              </p>
            </header>
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </FiltersProvider>
    </SidebarProvider>
  );
}
