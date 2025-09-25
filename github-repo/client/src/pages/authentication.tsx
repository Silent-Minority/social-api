import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Twitter, CheckCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sidebar } from "@/components/sidebar";

interface SocialAccount {
  id: string;
  platform: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}

export default function Authentication() {
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Query for social accounts
  const { data: accounts, isLoading, refetch } = useQuery<SocialAccount[]>({
    queryKey: ['/api/social-accounts'],
  });

  // Query for auth status
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/status'],
  });

  const handleConnectTwitter = async () => {
    setIsConnecting(true);
    try {
      // Redirect to Twitter OAuth
      window.location.href = '/auth/x/start';
    } catch (error) {
      console.error('Error connecting to Twitter:', error);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      await fetch(`/api/social-accounts/${accountId}`, {
        method: 'DELETE',
      });
      refetch();
    } catch (error) {
      console.error('Error disconnecting account:', error);
    }
  };

  const getStatusBadge = (account?: SocialAccount) => {
    if (!account) {
      return <Badge variant="secondary" data-testid="status-disconnected"><AlertCircle className="w-3 h-3 mr-1" />Disconnected</Badge>;
    }
    
    if (account.tokenExpiresAt) {
      const expiresAt = new Date(account.tokenExpiresAt);
      const now = new Date();
      const isExpired = expiresAt < now;
      
      if (isExpired) {
        return <Badge variant="destructive" data-testid="status-expired"><AlertCircle className="w-3 h-3 mr-1" />Token Expired</Badge>;
      }
    }
    
    return <Badge variant="default" data-testid="status-connected"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>;
  };

  const twitterAccount = accounts?.find(acc => acc.platform === 'x');

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="heading-authentication">
              Authentication
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Connect your social media accounts to enable posting
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Connection Status Alert */}
            {!twitterAccount && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No social media accounts connected. Connect your Twitter/X account to start posting.
                </AlertDescription>
              </Alert>
            )}

            {/* Twitter/X Connection */}
            <Card data-testid="card-twitter-auth">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Twitter className="w-5 h-5" />
                  Twitter / X
                </CardTitle>
                <CardDescription>
                  Connect your Twitter/X account to post updates and manage your social media presence
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Status</p>
                    {getStatusBadge(twitterAccount)}
                  </div>
                  <div className="space-y-1">
                    {twitterAccount ? (
                      <div className="space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDisconnect(twitterAccount.id)}
                          data-testid="button-disconnect-twitter"
                        >
                          Disconnect
                        </Button>
                        <Button 
                          size="sm"
                          onClick={handleConnectTwitter}
                          disabled={isConnecting}
                          data-testid="button-reconnect-twitter"
                        >
                          {isConnecting ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Reconnect
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        onClick={handleConnectTwitter}
                        disabled={isConnecting}
                        data-testid="button-connect-twitter"
                      >
                        {isConnecting ? <Clock className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Connect Twitter/X
                      </Button>
                    )}
                  </div>
                </div>

                {twitterAccount && (
                  <div className="space-y-2 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">User ID</p>
                        <p className="font-mono" data-testid="text-user-id">{twitterAccount.userId}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">Platform</p>
                        <p className="capitalize" data-testid="text-platform">{twitterAccount.platform}</p>
                      </div>
                      {twitterAccount.tokenExpiresAt && (
                        <div className="col-span-2">
                          <p className="text-gray-600 dark:text-gray-400">Token Expires</p>
                          <p className="text-sm" data-testid="text-token-expiry">
                            {new Date(twitterAccount.tokenExpiresAt).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Future Platforms */}
            <Card className="opacity-50">
              <CardHeader>
                <CardTitle className="text-gray-500">Coming Soon</CardTitle>
                <CardDescription>
                  Additional platforms will be available in future releases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                    <p className="text-gray-500">Facebook</p>
                  </div>
                  <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                    <p className="text-gray-500">Instagram</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}