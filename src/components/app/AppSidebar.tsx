import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/data/auth";
import { useWorkspace } from "@/lib/data/hooks";
import { BrandMark } from "./BrandMark";

export const NAV_ITEMS = [
  { title: "Genel Bakış", url: "/genel-bakis", icon: LayoutDashboard },
  { title: "Mağazalar", url: "/magazalar", icon: Store },
  { title: "Ürünler", url: "/urunler", icon: Package },
  { title: "Siparişler", url: "/siparisler", icon: ShoppingCart },
  { title: "Kârlılık", url: "/karlilik", icon: BarChart3 },
  { title: "Giderler", url: "/giderler", icon: Wallet },
  { title: "Raporlar", url: "/raporlar", icon: FileSpreadsheet },
  { title: "Ayarlar", url: "/ayarlar", icon: Settings },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user, tenant } = useWorkspace();

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/genel-bakis" className="flex items-center gap-2.5" onClick={() => setOpenMobile(false)}>
          <BrandMark />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-[15px] font-bold text-sidebar-accent-foreground">
                Smart Bussines Center
              </div>
              <div className="truncate text-xs text-sidebar-foreground/60">{tenant?.name ?? "Çalışma alanı"}</div>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {!collapsed && user && (
            <SidebarMenuItem>
              <div className="px-2 pb-1 text-xs text-sidebar-foreground/70">
                <div className="truncate font-medium text-sidebar-foreground">{user.name}</div>
                <div className="truncate">{user.email}</div>
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Çıkış yap"
              onClick={() => {
                signOut();
                navigate({ to: "/giris", replace: true });
              }}
            >
              <LogOut />
              <span>Çıkış yap</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

