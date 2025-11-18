import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Image,
  Globe,
  BarChart3,
  PieChart,
  MoreHorizontal,
  Presentation,
  Upload,
  Paperclip,
  Sparkles,
  Mic,
  ChevronDown
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { VoiceModal } from './VoiceModal';
import { AnimatedSphere } from './AnimatedSphere';
import { ChatMessage, ChatSession } from '../App';
import { useUser } from "@clerk/clerk-react";

/**
 * HomePage (updated)
 * ------------------
 * This file is an updated, fully self-contained version of your HomePage component
 * with robust localStorage history handling, safe parsing/stringifying, event-driven
 * syncing with the sandbox, and prevention of infinite update loops.
 *
 * NOTE: This file intentionally contains detailed comments and helper functions
 * to make it easy to read and maintain. Remove or trim comments for production.
 */

interface HomePageProps {
  onNavigateToSandbox?: () => void;
  continueSession?: ChatSession | null;
}

/**
 * Utility types and helpers
 */
type StoredSession = {
  id: string;
  title?: string;
  messages: ChatMessageSerializable[];
  createdAt?: string;
  lastUpdated?: string;
  isDraft?: boolean;
};

type ChatMessageSerializable = Omit<ChatMessage, 'timestamp'> & { timestamp: string };

// Safe JSON parse that never throws
const safeJSONParse = (str: string, fallback: any) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('safeJSONParse failed, returning fallback', e);
    return fallback;
  }
};

// Convert ChatMessage -> ChatMessageSerializable
const serializeMessages = (messages: ChatMessage[]) => {
  return messages.map((m) => ({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString() }));
};

// Convert ChatMessageSerializable -> ChatMessage
const deserializeMessages = (messages: ChatMessageSerializable[]) => {
  return messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
};

// Throttle writes to localStorage to avoid excessive churn
const throttle = <T extends (...args: any[]) => void>(fn: T, wait = 350) => {
  let last = 0;
  let timeout: any = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      last = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  };
};

/**
 * The HomePage component
 */
export function HomePage({ onNavigateToSandbox, continueSession }: HomePageProps) {
  // ---- UI state -----------------------------------------------------------
  const [isDraft, setIsDraft] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Nava AI');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => Date.now().toString());
  const [showOptions, setShowOptions] = useState(true);

  // ---- Refs ---------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Auth & keys -------------------------------------------------------
  const { user } = useUser();
  const HISTORY_KEY = user ? `nava-ai-history-${user.id}` : null;

  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const username =
    user?.username || user?.firstName || user?.fullName || (userEmail ? userEmail.split("@")[0] : "User");

  // ---- Small UI-only persistence -----------------------------------------
  useEffect(() => {
    localStorage.setItem('isDraft', String(isDraft));
  }, [isDraft]);

  // ---- Guard: wait for user to be available -------------------------------
  // Returning null early is fine while Clerk resolves the user object
  if (!user) return null;

  // ---- Helper: load entire history array from localStorage -----------------
  const loadHistory = useCallback((): StoredSession[] => {
    if (!HISTORY_KEY) return [];
    const raw = localStorage.getItem(HISTORY_KEY) || '[]';
    const parsed = safeJSONParse(raw, []);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredSession[];
  }, [HISTORY_KEY]);

  // ---- Helper: persist entire history array to localStorage ---------------
  const saveHistoryRaw = useCallback((sessions: StoredSession[]) => {
    if (!HISTORY_KEY) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
      // Notify other windows/tabs/pages
      window.dispatchEvent(new Event('nava-history-updated'));
    } catch (e) {
      console.error('Failed to save history', e);
    }
  }, [HISTORY_KEY]);

  // Throttled version to avoid frequent writes
  const saveHistory = useCallback(throttle(saveHistoryRaw, 300), [saveHistoryRaw]);

  // ---- Effect: load session messages on mount or when sessionId changes ---
  useEffect(() => {
    // We intentionally create a separate synchronous function so it is safe in the
    // effect body and we don't accidentally create a new function every render.
    const refresh = () => {
      if (!HISTORY_KEY || !currentSessionId) return;

      const sessions = loadHistory();
      const session = sessions.find((s) => s.id === currentSessionId);
      if (session) {
        setChatMessages(deserializeMessages(session.messages));
        setIsDraft(Boolean(session.isDraft));
      } else {
        // No session found — start fresh
        setChatMessages([]);
      }
    };

    refresh();

    // Optionally, listen to a custom event where the sandbox signals a save.
    // This keeps multiple windows in sync. We only add the listener once.
    const handleExternalUpdate = () => {
      refresh();
    };

    window.addEventListener('nava-sandbox-saved', handleExternalUpdate);
    window.addEventListener('storage', handleExternalUpdate); // cross-tab

    return () => {
      window.removeEventListener('nava-sandbox-saved', handleExternalUpdate);
      window.removeEventListener('storage', handleExternalUpdate);
    };
  }, [HISTORY_KEY, currentSessionId, loadHistory]);

  // ---- Effect: if `continueSession` prop arrives, load it ------------------
  useEffect(() => {
    if (continueSession) {
      setChatMessages(continueSession.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      setCurrentSessionId(continueSession.id);
      setIsDraft(Boolean(continueSession.isDraft));
    }
    // NOTE: continueSession is likely stable from parent; if parent recreates it
    // frequently, you may want to deep-compare or guard with IDs only.
  }, [continueSession]);

  // ---- Effect: auto-scroll to bottom whenever messages change -------------
  useEffect(() => {
    // Smooth scroll is nicer, but skip animation if user is actively scrolling.
    try {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      // ignore
    }
  }, [chatMessages]);

  // ---- Effect: save chat messages to HISTORY_KEY when messages update ------
  useEffect(() => {
    // We guard heavily to avoid writing empty sessions or writing when there's no user.
    if (!HISTORY_KEY || !currentSessionId) return;

    // If there are zero messages, we still persist an empty session metadata so that
    // switching tabs / sandbox can recreate a session. However you might prefer
    // to remove empty sessions — that behaviour is up to product requirements.

    const sessions = loadHistory();
    const idx = sessions.findIndex((s) => s.id === currentSessionId);

    const serialized = serializeMessages(chatMessages);

    const sessionTitle =
      chatMessages[0]?.content
        ? chatMessages[0].content.slice(0, 50) + (chatMessages[0].content.length > 50 ? '...' : '')
        : 'Untitled Session';

    const nowIso = new Date().toISOString();

    const newSession: StoredSession = {
      id: currentSessionId,
      title: sessionTitle,
      messages: serialized,
      createdAt: idx >= 0 ? sessions[idx].createdAt || nowIso : nowIso,
      lastUpdated: nowIso,
      isDraft: isDraft,
    };

    if (idx >= 0) {
      // Only replace if content changed — this prevents unnecessary writes + events
      const prev = sessions[idx];
      const prevSerialized = prev.messages || [];
      const prevLast = prev.lastUpdated || '';

      const changed = JSON.stringify(prevSerialized) !== JSON.stringify(serialized) || prev.isDraft !== isDraft;
      if (changed) {
        sessions[idx] = newSession;
        saveHistory(sessions);
      }
    } else {
      // Add to front
      sessions.unshift(newSession);
      saveHistory(sessions);
    }
  }, [chatMessages, currentSessionId, HISTORY_KEY, isDraft, loadHistory, saveHistory]);

  // ---- File / Image handlers ------------------------------------------------
  const handleFileUpload = () => fileInputRef.current?.click();
  const handleImageUpload = () => imageInputRef.current?.click();

  // ---- Voice modal handlers ------------------------------------------------
  const handleVoiceChat = () => setIsVoiceModalOpen(true);
  const handleVoiceTranscript = (text: string) => setPrompt(text);

  // ---- Keyboard handler ----------------------------------------------------
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // ---- Very small builtin 'AI' for demo purposes ---------------------------
  const generateResponse = (userInput: string): string => {
    const input = userInput.toLowerCase().trim();
    if (input === 'hi' || input === 'hey') return `Hi ${username}! How can I help you today?`;
    if (input.startsWith('hello')) return `Hello ${username}! What would you like me to create for you?`;
    if (input.includes('time') || input.includes('date')) {
      const now = new Date();
      return `Current time: ${now.toLocaleTimeString()}\nToday's date: ${now.toLocaleDateString()}`;
    }
    if (input.includes('joke')) {
      const jokes = [
        'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
        'Why did the AI go to therapy? It had too many deep learning issues! 🤖',
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }
    // Math helpers
    if (/\d/.test(input) && /add|\+/.test(input)) {
      const nums = userInput.match(/\d+(?:\.\d+)?/g);
      if (nums && nums.length >= 2) {
        const sum = nums.reduce((acc, n) => acc + parseFloat(n), 0);
        return `The sum of ${nums.join(' + ')} = ${sum}`;
      }
    }

    return `I understand you want to "${userInput}". Let me help you with that!`;
  };

  // ---- Generate handler: adds user message, then AI message -----------------
  const handleGenerate = () => {
    // Create a fresh session ID for every new conversation
    if (chatMessages.length === 0) {
      setCurrentSessionId(Date.now().toString());
    }

    if (!prompt.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: prompt,
      isUser: true,
      timestamp: new Date(),
    };

    // Add user message synchronously
    setChatMessages((prev) => [...prev, userMessage]);

    // Save a hint for sandbox (non-blocking)
    try {
      localStorage.setItem('sandbox-session-id', currentSessionId);
      localStorage.setItem('navaSandboxPrompt', prompt);
    } catch (e) {
      // ignore
    }

    // Code intent -> open sandbox
    if (prompt.toLowerCase().includes('code')) {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'll help you with that code! Opening the sandbox to generate and test your code...",
        isUser: false,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, aiMessage]);

      // Navigate after a short and user-noticeable delay
      setTimeout(() => {
        if (onNavigateToSandbox) onNavigateToSandbox();
      }, 600);

      return;
    }

    // Normal response -> simulated async
    const response = generateResponse(prompt);
    const aiMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      content: response,
      isUser: false,
      timestamp: new Date(),
    };

    // Simulate typing/latency
    setTimeout(() => {
      setChatMessages((prev) => [...prev, aiMessage]);
    }, 450);

    setPrompt('');
  };

  // ---- Small helpers for UI rendering -------------------------------------
  const aiModels = [
    'GPT-4',
    'GPT-4o',
    'Claude 3.5 Sonnet',
    'Claude 3 Opus',
    'Gemini 1.5 Pro',
    'Gemini Nano',
    'Perplexity',
    'Mistral 7B',
    'Mixtral 8x7B',
    'LLaMA 3',
    'Cohere Command R+',
    'Groq LPU',
    'DeepSeek V3',
    'OpenHermes',
    'Falcon 180B',
  ];

  const options = [
    { icon: Image, label: 'Image' },
    { icon: Presentation, label: 'Slides' },
    { icon: Globe, label: 'Webpage' },
    { icon: BarChart3, label: 'Spreadsheet' },
    { icon: PieChart, label: 'Visualization' },
    { icon: MoreHorizontal, label: 'More' },
  ];

  // ---- Render -----------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Scrollable Chat Messages Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 scrollbar-thin"
        style={{
          height: 'calc(100vh - 140px)', // accounts for footer height
          overflowX: 'hidden',
        }}
      >
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center min-h-full px-4 text-center">
            <div className=" sm:max-w-2xl">
              <div className="mb-6 sm:mb-8 flex justify-center scale-75 sm:scale-100">
                <AnimatedSphere size="small" />
              </div>

              <h1 className="text-2xl sm:text-4xl mb-2 sm:mb-4 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                Hello <span className="font-semibold">{username || 'User'}</span>
              </h1>
              <p className="text-base sm:text-xl text-muted-foreground mb-6 sm:mb-8">
                What can I create for you today?
              </p>

              <div className="flex items-center justify-center space-x-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-orange-400/10 rounded-lg sm:rounded-xl inline-flex text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-orange-400 rounded-full animate-pulse"></div>

                {/* Status toggle */}
                <span
                  onClick={() => setIsDraft((prev) => !prev)}
                  className="text-orange-600 dark:text-orange-400 cursor-pointer hover:underline"
                >
                  {isDraft ? 'Draft' : 'Published'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full py-4 px-3 sm:px-6">
            <div className="space-y-3 pb-4">
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start items-start space-x-2'}`}
                >
                  {!message.isUser && (
                    <div className="flex-shrink-0 self-start hidden sm:block">
                      <div className="w-5 h-5 flex items-center justify-center mt-0.5 mb-1">
                        <div className="scale-[0.25] transform-gpu">
                          <AnimatedSphere size="small" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] sm:max-w-[75%] p-2 sm:p-3 rounded-xl ${message.isUser
                      ? 'bg-gradient-to-r from-[#7B61FF] to-[#9F7AEA] text-white ml-1 sm:ml-2'
                      : 'bg-card border border-border'
                      }`}
                  >
                    <p className="text-xs sm:text-sm leading-relaxed break-words">{message.content}</p>
                    <div
                      className={`text-[10px] sm:text-[11px] mt-1 opacity-70 ${message.isUser ? 'text-white/70' : 'text-muted-foreground'}`}
                    >
                      {message.timestamp instanceof Date ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Fixed Footer - Input Area */}
      <div className=" bottom-0 left-0 w-full" style={{ padding: '0.5rem 1rem', maxHeight: '30vh' }}>
        <div className="max-w-3xl mx-auto">
          <div className="bg-card border border-border rounded-2xl shadow-md p-2 sm:p-3 flex flex-col gap-2 sm:gap-3">
            {/* Input Row */}
            <div className="flex items-center w-full gap-2 sm:gap-3">
              {/* Model Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="bg-gradient-to-r from-[#7B61FF]/10 to-[#9F7AEA]/10 hover:from-[#7B61FF]/20 hover:to-[#9F7AEA]/20 rounded-lg p-1.5 sm:p-2" title="Choose AI model">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#7B61FF]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44 sm:w-52 bg-card/95 backdrop-blur-xl max-h-[250px] overflow-y-auto">
                  {aiModels.map((model) => (
                    <DropdownMenuItem key={model} onClick={() => setSelectedModel(model)} className={`cursor-pointer ${selectedModel === model ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs sm:text-sm">{model}</span>
                        {selectedModel === model && <Sparkles className="w-3 sm:w-4 h-3 sm:h-4 text-primary" />}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Input
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  try {
                    localStorage.setItem('navaSandboxPrompt', e.target.value);
                  } catch (e) {
                    // ignore
                  }
                }}
                onKeyPress={handleKeyPress}
                placeholder="Ask Nava AI anything..."
                className="flex-1 text-sm sm:text-base bg-transparent border-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/70"
              />

              {/* Action Buttons */}
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <button onClick={handleFileUpload} className="p-1.5 sm:p-2 hover:bg-muted/50 rounded-lg" title="Attach file">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                </button>

                <button onClick={handleImageUpload} className="p-1.5 sm:p-2 hover:bg-muted/50 rounded-lg" title="Upload image">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                </button>

                <button onClick={handleVoiceChat} className="p-1.5 sm:p-2 hover:bg-muted/50 rounded-lg" title="Voice chat">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Compact More Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 sm:p-2 hover:bg-muted/50 rounded-lg" title="More options">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem] bg-card/95 backdrop-blur-xl">
                    {options.map((option, i) => {
                      const IconComponent = option.icon;
                      return (
                        <DropdownMenuItem key={i} onClick={() => console.log(`Selected: ${option.label}`)} className="flex items-center gap-2 text-sm hover:bg-muted/50 cursor-pointer">
                          <IconComponent className="w-4 h-4 text-muted-foreground" />
                          <span>{option.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Generate Button */}
                <Button onClick={handleGenerate} className="px-3 sm:px-5 py-2 bg-gradient-to-r from-[#7B61FF] to-[#9F7AEA] text-white rounded-lg text-sm sm:text-base hover:scale-105 transition-all">
                  <Sparkles className="w-4 h-4 mr-1 sm:mr-2" />
                  Generate
                </Button>
              </div>
            </div>

            {/* Model Label */}
            {(chatMessages.length === 0 || showOptions) && (
              <div className="flex justify-center text-xs sm:text-sm text-muted-foreground mt-1">
                <Sparkles className="w-3 h-3 text-[#7B61FF] mr-1" />
                <span>{selectedModel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voice Modal */}
      <VoiceModal isOpen={isVoiceModalOpen} onClose={() => setIsVoiceModalOpen(false)} onTranscript={handleVoiceTranscript} />

      {/* Hidden inputs for file/image upload (keep in DOM) */}
      <input ref={fileInputRef} type="file" className="hidden" />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}

// Export default for easy importing if desired
export default HomePage;
