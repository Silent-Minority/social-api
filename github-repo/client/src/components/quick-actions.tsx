import { Zap, TestTube, Settings, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function QuickActions() {
  const { toast } = useToast();

  const actions = [
    {
      icon: TestTube,
      title: "Test API",
      description: "Send test requests",
      color: "primary",
      onClick: () => {
        toast({
          title: "API Testing",
          description: "Would open API testing interface",
        });
      }
    },
    {
      icon: Settings,
      title: "Configure",
      description: "Edit environment",
      color: "secondary",
      onClick: () => {
        toast({
          title: "Configuration",
          description: "Would open environment configuration",
        });
      }
    },
    {
      icon: RotateCcw,
      title: "Restart",
      description: "Reload server",
      color: "accent",
      onClick: () => {
        toast({
          title: "Server Restart",
          description: "Would restart the server",
        });
      }
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "primary":
        return "bg-primary/10 hover:bg-primary/20 border-primary/20 group-hover:bg-primary/30";
      case "secondary":
        return "bg-secondary/10 hover:bg-secondary/20 border-secondary/20 group-hover:bg-secondary/30";
      case "accent":
        return "bg-accent/10 hover:bg-accent/20 border-accent/20 group-hover:bg-accent/30";
      default:
        return "bg-muted/10 hover:bg-muted/20 border-muted/20";
    }
  };

  const getIconColor = (color: string) => {
    switch (color) {
      case "primary":
        return "text-primary";
      case "secondary":
        return "text-secondary";
      case "accent":
        return "text-accent";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Zap className="text-primary w-5 h-5" />
          Quick Actions
        </h3>
        <p className="text-sm text-muted-foreground">Common development tasks</p>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {actions.map((action) => (
            <Button
              key={action.title}
              onClick={action.onClick}
              variant="ghost"
              className={`p-4 h-auto rounded-lg border transition-colors group ${getColorClasses(action.color)}`}
              data-testid={`button-${action.title.toLowerCase().replace(" ", "-")}`}
            >
              <div className="flex items-center gap-3 w-full">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${getColorClasses(action.color)}`}>
                  <action.icon className={`w-5 h-5 ${getIconColor(action.color)}`} />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-foreground">{action.title}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
