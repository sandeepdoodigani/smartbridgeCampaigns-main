import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Mail, 
  BarChart3, 
  Settings, 
  PlusCircle,
  Send,
  Users,
  Filter,
  Shield,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

const roleLabels = {
  admin: 'Admin',
  associate: 'Associate', 
  analyst: 'Analyst',
};

const roleBadgeColors = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  associate: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  analyst: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin, canManageCampaigns, canManageSubscribers } = useAuth();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/", show: true },
    { icon: Mail, label: "Campaigns", href: "/campaigns", show: true },
    { icon: Users, label: "Subscribers", href: "/subscribers", show: canManageSubscribers },
    { icon: Filter, label: "Segments", href: "/segments", show: canManageSubscribers },
    { icon: Shield, label: "Audit Logs", href: "/audit-logs", show: isAdmin },
    { icon: Settings, label: "Settings", href: "/settings", show: true },
  ].filter(item => item.show);

  const userInitials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <div className="h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-10">
      <div className="p-6 flex items-center gap-3">
        <img 
          src="https://www.thesmartbridge.com/lovable-uploads/sm3.png" 
          alt="SmartBridge" 
          className="w-8 h-8 object-contain"
        />
        <h1 className="font-display font-bold text-lg tracking-tight">SmartBridge Campaigns</h1>
      </div>

      <div className="px-3 py-4 flex-1">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        {canManageCampaigns && (
          <div className="mt-8">
            <h3 className="px-3 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">
              Quick Actions
            </h3>
            <Button asChild className="w-full justify-start gap-2 bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 border-sidebar-border" variant="outline" size="sm">
              <Link href="/campaigns/new">
                <PlusCircle className="w-4 h-4" />
                New Campaign
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium">
            {userInitials}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              {user?.role && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", roleBadgeColors[user.role])}>
                  {roleLabels[user.role]}
                </span>
              )}
            </div>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
