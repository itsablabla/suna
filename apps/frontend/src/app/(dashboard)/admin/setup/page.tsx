'use client';

import { useState } from 'react';
import { UserPlus, Copy, Check, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEMO_EMAIL = 'jadengarza@pm.me';

interface CreatedCredentials {
  email: string;
  password: string;
  userId: string;
}

export default function AdminSetupPage() {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [isLoading, setIsLoading] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  const handleCreateUser = async () => {
    setIsLoading(true);
    setError(null);
    setCredentials(null);

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Failed to create user.');
        return;
      }

      setCredentials({
        email: data.email,
        password: data.password,
        userId: data.userId,
      });
    } catch {
      setError('Network error — could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-none">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin Setup</h1>
              <p className="text-sm text-muted-foreground">
                Create demo users for testing without Supabase dashboard access
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-2 space-y-4">
          {/* Create User Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="w-4 h-4" />
                Create Demo User
              </CardTitle>
              <CardDescription>
                Creates a new Supabase user with email confirmation pre-approved and a
                randomly generated password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  disabled={isLoading}
                />
              </div>

              <Button
                onClick={handleCreateUser}
                disabled={isLoading || !email}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Creating user…
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Demo User
                  </>
                )}
              </Button>

              {/* Error state */}
              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Success / Credentials Card */}
          {credentials && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-green-600 dark:text-green-400">
                  <Check className="w-4 h-4" />
                  User created successfully
                </CardTitle>
                <CardDescription>
                  User ID: <span className="font-mono text-xs">{credentials.userId}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Email row */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" />
                    Email
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={credentials.email}
                      className="font-mono text-sm bg-muted/50"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(credentials.email, 'email')}
                      title="Copy email"
                    >
                      {copiedField === 'email' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Password row */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="w-3 h-3" />
                    Generated password
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={credentials.password}
                      className="font-mono text-sm bg-muted/50"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(credentials.password, 'password')}
                      title="Copy password"
                    >
                      {copiedField === 'password' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-1">
                  Save these credentials now — the password will not be shown again.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
