'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Zap, Loader2, AlertCircle, CheckCircle2, Bot, User, Trash2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const SAMPLE_MESSAGE = "Hello SUNA, what can you do?";

type MessageRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface RunState {
  status: 'idle' | 'starting' | 'streaming' | 'completed' | 'error';
  threadId: string | null;
  agentRunId: string | null;
  error: string | null;
}

// Parse SSE message data and extract displayable text content
function extractTextContent(rawData: string): string | null {
  try {
    const parsed = JSON.parse(rawData);

    // Skip ping/status messages
    if (parsed.type === 'ping') return null;

    // Handle assistant text content
    if (parsed.type === 'assistant' && parsed.content) {
      if (typeof parsed.content === 'string') return parsed.content;
      if (Array.isArray(parsed.content)) {
        return parsed.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text || '')
          .join('');
      }
    }

    // Handle tool result / text blocks
    if (parsed.type === 'text' && typeof parsed.text === 'string') {
      return parsed.text;
    }

    // Handle status messages
    if (parsed.type === 'status') {
      if (parsed.status === 'completed') return null; // handled by onClose
      if (parsed.message) return null; // skip status messages in chat
    }

    return null;
  } catch {
    // Not JSON — return raw string if it looks like plain text
    const trimmed = rawData.trim();
    if (trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return trimmed;
    }
    return null;
  }
}

export default function DemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [runState, setRunState] = useState<RunState>({
    status: 'idle',
    threadId: null,
    agentRunId: null,
    error: null,
  });
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { cache: 'no-store' });
        setBackendStatus(res.ok ? 'online' : 'offline');
      } catch {
        setBackendStatus('offline');
      }
    };
    if (BACKEND_URL) checkHealth();
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const appendToLastAssistantMessage = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + chunk },
        ];
      }
      // Start a new streaming assistant message
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: chunk,
          timestamp: new Date(),
          isStreaming: true,
        },
      ];
    });
  }, []);

  const finalizeLastAssistantMessage = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, isStreaming: false }];
      }
      return prev;
    });
  }, []);

  const startAgentRun = useCallback(async (prompt: string) => {
    if (!BACKEND_URL) {
      setRunState((s) => ({
        ...s,
        status: 'error',
        error: 'NEXT_PUBLIC_BACKEND_URL is not configured.',
      }));
      return;
    }

    // Add user message to chat
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: new Date(),
      },
    ]);

    setRunState({ status: 'starting', threadId: null, agentRunId: null, error: null });

    try {
      // Get auth token
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append('prompt', prompt.trim());

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${BACKEND_URL}/agent/start`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const errData = await res.json();
          errMsg = errData.detail?.message || errData.message || errData.detail || errMsg;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const data = await res.json() as {
        thread_id: string;
        agent_run_id: string;
        project_id?: string;
        status: string;
      };

      setRunState({
        status: 'streaming',
        threadId: data.thread_id,
        agentRunId: data.agent_run_id,
        error: null,
      });

      // Open SSE stream
      const streamUrl = new URL(`${BACKEND_URL}/agent-run/${data.agent_run_id}/stream`);
      if (session?.access_token) {
        streamUrl.searchParams.set('token', session.access_token);
      }

      const es = new EventSource(streamUrl.toString());
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const raw = event.data;
        if (!raw || raw.trim() === '') return;

        // Detect completion
        if (
          raw.includes('"type": "status"') &&
          (raw.includes('"status": "completed"') || raw.includes('thread_run_end'))
        ) {
          finalizeLastAssistantMessage();
          setRunState((s) => ({ ...s, status: 'completed' }));
          es.close();
          eventSourceRef.current = null;
          return;
        }

        const text = extractTextContent(raw);
        if (text) appendToLastAssistantMessage(text);
      };

      es.onerror = () => {
        finalizeLastAssistantMessage();
        // Check if the run actually completed (onerror fires on normal close too)
        setRunState((s) => {
          if (s.status === 'streaming') {
            return { ...s, status: 'completed' };
          }
          return s;
        });
        es.close();
        eventSourceRef.current = null;
      };
    } catch (err: any) {
      const errMsg = err?.message || 'An unexpected error occurred.';
      setRunState({ status: 'error', threadId: null, agentRunId: null, error: errMsg });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: `Error: ${errMsg}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [appendToLastAssistantMessage, finalizeLastAssistantMessage]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || runState.status === 'starting' || runState.status === 'streaming') return;
    setInput('');
    startAgentRun(trimmed);
  }, [input, runState.status, startAgentRun]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setMessages([]);
    setRunState({ status: 'idle', threadId: null, agentRunId: null, error: null });
  };

  const isLoading = runState.status === 'starting' || runState.status === 'streaming';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">SUNA Demo</h1>
              <p className="text-xs text-muted-foreground">API test interface</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span className="hidden sm:inline">Backend:</span>
              {backendStatus === 'unknown' && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">Checking…</Badge>
              )}
              {backendStatus === 'online' && (
                <Badge className="text-xs px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/20">Online</Badge>
              )}
              {backendStatus === 'offline' && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">Offline</Badge>
              )}
            </div>

            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-xs h-7">
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-4">

        {/* Info card */}
        {messages.length === 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                SUNA API Demo
              </CardTitle>
              <CardDescription>
                Send messages to the SUNA backend and see responses in real-time via Server-Sent Events.
                Requires <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">NEXT_PUBLIC_BACKEND_URL</code> to be configured.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Config status */}
              <div className="flex items-start gap-2 text-sm">
                {BACKEND_URL ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-medium">Backend URL: </span>
                  {BACKEND_URL ? (
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{BACKEND_URL}</code>
                  ) : (
                    <span className="text-destructive text-xs">Not configured — set NEXT_PUBLIC_BACKEND_URL</span>
                  )}
                </div>
              </div>

              {/* Quick-start button */}
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs"
                  disabled={isLoading || !BACKEND_URL}
                  onClick={() => startAgentRun(SAMPLE_MESSAGE)}
                >
                  <Zap className="h-3 w-3" />
                  Try: &ldquo;{SAMPLE_MESSAGE}&rdquo;
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Run metadata */}
        {(runState.threadId || runState.agentRunId) && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {runState.threadId && (
              <span className="flex items-center gap-1 bg-muted/60 rounded-md px-2 py-1 font-mono">
                thread: {runState.threadId.slice(0, 12)}…
              </span>
            )}
            {runState.agentRunId && (
              <span className="flex items-center gap-1 bg-muted/60 rounded-md px-2 py-1 font-mono">
                run: {runState.agentRunId.slice(0, 12)}…
              </span>
            )}
            {runState.status === 'streaming' && (
              <span className="flex items-center gap-1.5 text-blue-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Streaming…
              </span>
            )}
            {runState.status === 'completed' && (
              <span className="flex items-center gap-1.5 text-green-500">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </span>
            )}
          </div>
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.role === 'system'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {msg.role === 'user' ? (
                    <User className="h-3.5 w-3.5" />
                  ) : msg.role === 'system' ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : msg.role === 'system'
                        ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
                        : 'bg-muted text-foreground rounded-tl-sm',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-current opacity-70 animate-pulse ml-0.5 align-middle" />
                  )}
                  <p
                    className={cn(
                      'text-[10px] mt-1 opacity-50',
                      msg.role === 'user' ? 'text-right' : 'text-left',
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Loading indicator when starting */}
        {runState.status === 'starting' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pl-10">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting agent run…
          </div>
        )}
      </main>

      {/* Input area — sticky at bottom */}
      <div className="sticky bottom-0 border-t border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Quick-test button (shown when chat is active) */}
          {messages.length > 0 && !isLoading && (
            <div className="mb-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
                onClick={() => startAgentRun(SAMPLE_MESSAGE)}
                disabled={isLoading || !BACKEND_URL}
              >
                <Zap className="h-3 w-3" />
                Send sample message
              </Button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !BACKEND_URL
                  ? 'Set NEXT_PUBLIC_BACKEND_URL to enable…'
                  : isLoading
                    ? 'Waiting for response…'
                    : 'Message SUNA… (Enter to send, Shift+Enter for newline)'
              }
              disabled={isLoading || !BACKEND_URL}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5',
                'text-sm placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'min-h-[42px] max-h-[160px] overflow-y-auto',
                'transition-colors',
              )}
              style={{
                height: 'auto',
                // Grow with content
                fieldSizing: 'content' as any,
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !BACKEND_URL}
              size="icon"
              className="shrink-0 h-[42px] w-[42px] rounded-2xl"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            POST <code className="font-mono">/agent/start</code> → SSE stream from{' '}
            <code className="font-mono">/agent-run/&#123;id&#125;/stream</code>
          </p>
        </div>
      </div>
    </div>
  );
}
