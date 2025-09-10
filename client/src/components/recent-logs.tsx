import { FileText, Download, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function RecentLogs() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/logs"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const getLogTypeColor = (method: string, statusCode?: number) => {
    if (method === "INFO") return "bg-blue-500/10 text-blue-500";
    if (method === "SUCCESS") return "bg-green-500/10 text-green-500";
    if (method === "WARN") return "bg-yellow-500/10 text-yellow-500";
    if (method === "ERROR") return "bg-red-500/10 text-red-500";
    
    // HTTP methods
    if (statusCode && statusCode >= 200 && statusCode < 300) {
      return "bg-green-500/10 text-green-500";
    }
    if (statusCode && statusCode >= 400) {
      return "bg-red-500/10 text-red-500";
    }
    
    return "bg-blue-500/10 text-blue-500";
  };

  const formatLogEntry = (log: any) => {
    const timestamp = new Date(log.timestamp).toLocaleString();
    return {
      timestamp,
      type: log.method,
      message: `${log.statusCode} ${log.path} - ${log.responseTime}ms`,
      color: getLogTypeColor(log.method, log.statusCode)
    };
  };

  const staticLogs = [
    {
      timestamp: new Date().toLocaleString(),
      type: "INFO",
      message: "Server started on port 5000",
      color: "bg-blue-500/10 text-blue-500"
    },
    {
      timestamp: new Date().toLocaleString(),
      type: "SUCCESS", 
      message: "CORS middleware configured",
      color: "bg-green-500/10 text-green-500"
    },
    {
      timestamp: new Date().toLocaleString(),
      type: "INFO",
      message: "Routes loaded: /auth, /api",
      color: "bg-blue-500/10 text-blue-500"
    }
  ];

  const allLogs = [
    ...staticLogs,
    ...(logs || []).map(formatLogEntry)
  ].slice(0, 10);

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <FileText className="text-primary w-5 h-5" />
          Recent Logs
        </h3>
        <p className="text-sm text-muted-foreground">Latest server activity</p>
      </div>
      <div className="p-6">
        <div className="bg-muted/20 rounded-lg p-4 font-mono text-sm space-y-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="text-muted-foreground">Loading logs...</div>
          ) : allLogs.length > 0 ? (
            allLogs.map((log, index) => (
              <div
                key={index}
                className="flex items-center gap-3 text-muted-foreground"
                data-testid={`log-entry-${index}`}
              >
                <span className="text-xs">{log.timestamp}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${log.color}`}>
                  {log.type}
                </span>
                <span>{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">No logs available</div>
          )}
        </div>
        
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-download-logs"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Full Logs
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-clear-logs"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Logs
          </Button>
        </div>
      </div>
    </div>
  );
}
