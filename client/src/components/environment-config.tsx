import { Settings, Database, Key, Lock, Globe, Shield, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ServerConfig } from "@shared/schema";

export function EnvironmentConfig() {
  const { data: config, isLoading } = useQuery<ServerConfig>({
    queryKey: ["/api/config"],
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Settings className="text-primary w-5 h-5" />
            Environment Config
          </h3>
          <p className="text-sm text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  const envVars = [
    {
      icon: Database,
      name: "PORT",
      value: config?.port || "5000",
      status: "configured",
      color: "green"
    },
    {
      icon: Key,
      name: "X_API_KEY",
      value: config?.xApiKey ? "••••••••" : "Missing",
      status: config?.xApiKey ? "configured" : "missing",
      color: config?.xApiKey ? "green" : "red"
    },
    {
      icon: Lock,
      name: "X_API_SECRET",
      value: config?.xApiSecret ? "••••••••" : "Missing",
      status: config?.xApiSecret ? "configured" : "missing",
      color: config?.xApiSecret ? "green" : "red"
    },
    {
      icon: Globe,
      name: "CORS_ORIGIN",
      value: config?.corsOrigin || "*",
      status: "configured",
      color: "green"
    },
    {
      icon: Shield,
      name: "JWT_SECRET",
      value: config?.jwtSecret || "default",
      status: config?.jwtSecret === "configured" ? "configured" : "default",
      color: config?.jwtSecret === "configured" ? "green" : "yellow"
    },
  ];

  const getStatusColor = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-500";
      case "yellow":
        return "bg-yellow-500";
      case "red":
        return "bg-red-500";
      default:
        return "bg-muted";
    }
  };

  const missingCredentials = !config?.xApiKey || !config?.xApiSecret;

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="text-primary w-5 h-5" />
          Environment Config
        </h3>
        <p className="text-sm text-muted-foreground">Environment variables status</p>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {envVars.map((envVar) => (
            <div
              key={envVar.name}
              className="flex items-center justify-between"
              data-testid={`env-${envVar.name.toLowerCase()}`}
            >
              <div className="flex items-center gap-3">
                <envVar.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{envVar.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(envVar.color)}`}></div>
                <span className="text-xs text-muted-foreground">{envVar.value}</span>
              </div>
            </div>
          ))}
        </div>
        
        {missingCredentials && (
          <div className="mt-6 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-destructive w-4 h-4 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Configuration Required</p>
                <p className="text-xs text-destructive/80 mt-1">
                  X API credentials are missing. Configure them in your .env file to enable social posting.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
