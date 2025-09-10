import { Route } from "lucide-react";

export function RoutesTable() {
  const routes = [
    { method: "GET", path: "/health", status: "online", time: "200ms", color: "green" },
    { method: "POST", path: "/auth/x", status: "pending", time: "Pending", color: "yellow" },
    { method: "GET", path: "/api/status", status: "online", time: "150ms", color: "green" },
    { method: "GET", path: "/api/config", status: "online", time: "120ms", color: "green" },
    { method: "GET", path: "/api/logs", status: "online", time: "180ms", color: "green" },
    { method: "POST", path: "/api/post", status: "online", time: "250ms", color: "green" },
    { method: "GET", path: "/api/test", status: "online", time: "100ms", color: "green" },
    { method: "ALL", path: "/*", status: "CORS", time: "CORS", color: "purple" },
  ];

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-green-500/10 text-green-500";
      case "POST":
        return "bg-blue-500/10 text-blue-500";
      case "PUT":
        return "bg-orange-500/10 text-orange-500";
      case "DELETE":
        return "bg-red-500/10 text-red-500";
      case "ALL":
        return "bg-purple-500/10 text-purple-500";
      default:
        return "bg-muted/10 text-muted-foreground";
    }
  };

  const getStatusColor = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-500";
      case "yellow":
        return "bg-yellow-500";
      case "red":
        return "bg-red-500";
      case "purple":
        return "bg-purple-500";
      default:
        return "bg-muted";
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Route className="text-primary w-5 h-5" />
          API Routes
        </h3>
        <p className="text-sm text-muted-foreground">Currently configured endpoints</p>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {routes.map((route, index) => (
            <div
              key={`${route.method}-${route.path}`}
              className="flex items-center justify-between py-3 border-b border-border last:border-b-0"
              data-testid={`route-${index}`}
            >
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getMethodColor(route.method)}`}>
                  {route.method}
                </span>
                <code className="text-sm text-foreground">{route.path}</code>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(route.color)}`}></div>
                <span className="text-xs text-muted-foreground">{route.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
