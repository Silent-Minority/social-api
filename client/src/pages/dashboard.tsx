import { Sidebar } from "@/components/sidebar";
import { StatsGrid } from "@/components/stats-grid";
import { RoutesTable } from "@/components/routes-table";
import { EnvironmentConfig } from "@/components/environment-config";
import { RecentLogs } from "@/components/recent-logs";
import { QuickActions } from "@/components/quick-actions";
import { RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Project Overview</h2>
              <p className="text-muted-foreground">Monitor your Express.js API backend</p>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleRefresh}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-secondary-foreground" />
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          <StatsGrid status={status} isLoading={isLoading} />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RoutesTable />
            <EnvironmentConfig />
          </div>

          <RecentLogs />
          <QuickActions />
        </div>
      </main>
    </div>
  );
}
