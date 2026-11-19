import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app/AppSidebar";
import { FiltersProvider } from "@/components/app/filters";
import { currentSession } from "@/lib/data/auth";

export const Route = createFileRoute("/_panel")({
  // Prototype session lives in browser storage, which the server cannot read.
  ssr: false,
  beforeLoad: ({ location }) => {
    if (!currentSession()) {
      throw redirect({ to: "/giris", search: { redirect: location.href } });
    }
  },
  component: PanelLayout,
});

function PanelLayout() {
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
                  Prototip modu · veriler bu tarayıcıda saklanır · pazaryeri bağlantısı yok
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
