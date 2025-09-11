import { Share2, BarChart3, Route, Key, Settings, FileText, TestTube } from "lucide-react";
import { Link, useLocation } from "wouter";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { icon: BarChart3, label: "Dashboard", href: "/", active: location === "/" || location === "/dashboard" },
    { icon: Route, label: "API Routes", href: "/routes", active: location === "/routes" },
    { icon: Key, label: "Authentication", href: "/authentication", active: location === "/authentication" },
    { icon: Settings, label: "Configuration", href: "/config", active: location === "/config" },
    { icon: FileText, label: "Logs", href: "/logs", active: location === "/logs" },
    { icon: TestTube, label: "API Testing", href: "/testing", active: location === "/testing" },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex-shrink-0">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Share2 className="text-primary-foreground w-4 h-4" />
          </div>
          Mirancourt Social
        </h1>
        <p className="text-sm text-muted-foreground mt-1">API Dashboard</p>
      </div>
      
      <nav className="px-4 space-y-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
              }`}
              data-testid={`link-${item.label.toLowerCase().replace(" ", "-")}`}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>
      
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-muted/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-foreground">Server Online</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-server-port">
            Port {import.meta.env.VITE_PORT || 5000}
          </p>
        </div>
      </div>
    </aside>
  );
}
