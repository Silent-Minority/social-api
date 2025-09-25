import { CheckCircle, Route, TrendingUp, Twitter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ServerConfig, ServerStatus } from "@shared/schema";

interface StatsGridProps {
  status?: ServerStatus;
  isLoading: boolean;
}

export function StatsGrid({ status, isLoading }: StatsGridProps) {
  const { data: config } = useQuery<ServerConfig>({
    queryKey: ["/api/config"],
  });

  const stats = [
    {
      title: "API Status",
      value: isLoading ? "Loading..." : status?.server || "Unknown",
      icon: CheckCircle,
      color: "green",
      testId: "status-api"
    },
    {
      title: "Active Routes",
      value: isLoading ? "..." : status?.totalRoutes || "8",
      icon: Route,
      color: "blue",
      testId: "status-routes"
    },
    {
      title: "Requests Today",
      value: isLoading ? "..." : status?.requestsToday || "0",
      icon: TrendingUp,
      color: "purple",
      testId: "status-requests"
    },
    {
      title: "X Auth Status",
      value: config?.xApiKey && config?.xApiSecret ? "Ready" : "Pending",
      icon: Twitter,
      color: config?.xApiKey && config?.xApiSecret ? "green" : "yellow",
      testId: "status-x-auth"
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-500/10 text-green-500";
      case "blue":
        return "bg-blue-500/10 text-blue-500";
      case "purple":
        return "bg-purple-500/10 text-purple-500";
      case "yellow":
        return "bg-yellow-500/10 text-yellow-500";
      default:
        return "bg-muted/10 text-muted-foreground";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => (
        <div key={stat.title} className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <p 
                className="text-2xl font-semibold text-foreground"
                data-testid={stat.testId}
              >
                {stat.value}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorClasses(stat.color)}`}>
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
