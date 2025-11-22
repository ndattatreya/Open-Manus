import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Loader2,
  Terminal,
  Play,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  Cpu,
  Wrench,
  AlertCircle,
  Info,
  FileCode,
  Code as CodeIcon,
  X
} from 'lucide-react';

interface SandboxPageProps {
  autoRun?: boolean;
}

type LogType = 'thought' | 'tool' | 'error' | 'info';

interface LogSection {
  id: string;
  title: string;
  content: string[];
  isOpen: boolean;
  type: LogType;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content?: string;
  logs?: LogSection[];
  timestamp: Date;
}

export const SandboxPage: React.FC<SandboxPageProps> = ({ autoRun = false }) => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File Viewer State
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  // Load prompt if saved
  useEffect(() => {
    const saved = localStorage.getItem('navaSandboxPrompt');
    if (saved) setPrompt(saved);
  }, []);

  // Auto-run if requested
  useEffect(() => {
    if (autoRun && prompt && !isGenerating && messages.length === 0) {
      handleGenerate();
    }
  }, [autoRun, prompt]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getLogType = (line: string): LogType => {
    if (line.includes('thoughts:') || line.includes('✨')) return 'thought';
    if (
      line.includes('selected') ||
      line.includes('tools') ||
      line.includes('Tools being prepared') ||
      line.includes('Tool arguments') ||
      line.includes('Activating tool') ||
      line.includes('completed its mission') ||
      line.includes('Observed output') ||
      line.match(/^(🛠️|🧰|🔧|🎯)/)
    ) return 'tool';
    if (line.includes('Error') || line.includes('error') || line.includes('Snag') || line.includes('🚨') || line.includes('⚠️')) return 'error';
    return 'info';
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setIsDone(false);
    setShowCodePanel(false); // Reset view on new generation

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date()
    };

    const botMsgId = crypto.randomUUID();
    const botMsg: ChatMessage = {
      id: botMsgId,
      role: 'bot',
      logs: [],
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg, botMsg]);

    try {
      const ws = new WebSocket('ws://localhost:5000/ws/generate');

      ws.onopen = () => {
        console.log('Connected to server');
        ws.send(prompt);
      };

      ws.onmessage = (event) => {
        const msg = event.data;

        if (msg === "DONE") {
          setIsGenerating(false);
          setIsDone(true);
          ws.close();
          return;
        }

        setMessages(prev => {
          return prev.map(m => {
            if (m.id === botMsgId) {
              const currentLogs = m.logs || [];
              const lastLog = currentLogs[currentLogs.length - 1];
              const msgType = getLogType(msg);

              // Grouping Logic
              let shouldAppend = false;
              if (lastLog) {
                if (lastLog.type === 'tool' && msgType === 'tool') {
                  shouldAppend = true;
                } else if (lastLog.type === 'thought' && msgType === 'thought' && !msg.includes('thoughts:')) {
                  shouldAppend = true;
                } else if (lastLog.type === 'info' && msgType === 'info') {
                  shouldAppend = true;
                }
              }

              if (shouldAppend && lastLog) {
                const updatedLastLog = {
                  ...lastLog,
                  content: [...lastLog.content, msg]
                };
                return {
                  ...m,
                  logs: [...currentLogs.slice(0, -1), updatedLastLog]
                };
              } else {
                let title = msg;
                if (msgType === 'thought') title = 'Manus Thoughts';
                if (msgType === 'tool') title = 'Tools';
                if (msgType === 'error') title = 'Error';

                if (title === msg) {
                  title = msg.length > 40 ? msg.slice(0, 40) + '...' : msg;
                }

                const newSection: LogSection = {
                  id: crypto.randomUUID(),
                  title,
                  content: [msg],
                  isOpen: msgType === 'thought',
                  type: msgType
                };
                return {
                  ...m,
                  logs: [...currentLogs, newSection]
                };
              }
            }
            return m;
          });
        });
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsGenerating(false);
      };

      ws.onclose = () => {
        if (isGenerating) setIsGenerating(false);
      };

    } catch (e) {
      console.error("Error starting generation:", e);
      setIsGenerating(false);
    }
  };

  const toggleLogSection = (msgId: string, sectionId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId && m.logs) {
        return {
          ...m,
          logs: m.logs.map(l => l.id === sectionId ? { ...l, isOpen: !l.isOpen } : l)
        };
      }
      return m;
    }));
  };

  const handleShowCode = async () => {
    try {
      const res = await fetch('http://localhost:8000/files');
      const data = await res.json();
      setFiles(data.files);
      if (data.files.length > 0) {
        setActiveFile(data.files[0]);
        const contentRes = await fetch(`http://localhost:8000/files/${data.files[0]}`);
        const content = await contentRes.text();
        setFileContent(content);
      }
      setShowCodePanel(true);
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  };

  const handleFileClick = async (filename: string) => {
    setActiveFile(filename);
    try {
      const res = await fetch(`http://localhost:8000/files/${filename}`);
      const content = await res.text();
      setFileContent(content);
    } catch (e) {
      console.error("Failed to fetch file content", e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-foreground font-sans selection:bg-primary/20">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/40 flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-medium tracking-tight">Manus Sandbox</h1>
            <p className="text-xs text-muted-foreground font-medium">Interactive Agent Environment</p>
          </div>
        </div>

        {isDone && !showCodePanel && (
          <Button
            onClick={handleShowCode}
            className="bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            <CodeIcon className="w-4 h-4 mr-2" />
            View Code
          </Button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${showCodePanel ? 'w-1/2 border-r border-border/40' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-smooth">
            <div className="max-w-5xl mx-auto space-y-8">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-4 max-w-full md:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div className={`flex flex-col gap-2 min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start w-full'}`}>

                      {msg.role === 'user' && (
                        <div className="bg-primary text-primary-foreground px-5 py-3 rounded-2xl rounded-tr-sm shadow-md">
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                      )}

                      {msg.role === 'bot' && (
                        <div className="flex flex-col gap-3 w-full">
                          {msg.logs?.length === 0 && isGenerating && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse px-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span className="font-medium">Manus is thinking...</span>
                            </div>
                          )}

                          {msg.logs?.map((log) => (
                            <div key={log.id} className="group border border-border/50 rounded-xl bg-card/50 overflow-hidden transition-all duration-200 hover:border-border/80 hover:shadow-sm">
                              <div
                                onClick={() => toggleLogSection(msg.id, log.id)}
                                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors select-none"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  {log.type === 'thought' && <Cpu className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
                                  {log.type === 'tool' && <Wrench className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                                  {log.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                                  {log.type === 'info' && <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />}

                                  <span className="text-sm font-medium text-foreground/90 truncate">
                                    {log.title}
                                  </span>
                                </div>
                                <div className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                                  {log.isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </div>
                              </div>

                              {log.isOpen && (
                                <div className="p-4 pt-0 animate-in slide-in-from-top-1 duration-200">
                                  <div className="pt-3 border-t border-border/40">
                                    <div className={`text-sm font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-words ${log.type === 'thought' ? '' : 'overflow-x-auto'
                                      }`}>
                                      {log.content.join('\n')}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <span className="text-[10px] text-muted-foreground/40 px-1 font-medium">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-border/40 bg-background/80 backdrop-blur-md">
            <div className="max-w-3xl mx-auto flex gap-3">
              <Input
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  localStorage.setItem('navaSandboxPrompt', e.target.value);
                }}
                placeholder="Describe your task..."
                className="flex-1 bg-muted/50 border-transparent focus:bg-background focus:border-primary/20 transition-all shadow-inner"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) handleGenerate();
                }}
                disabled={isGenerating}
              />
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/20 transition-all px-6"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Code Panel (Right Side) */}
        {showCodePanel && (
          <div className="w-1/2 flex flex-col bg-[#1e1e1e] border-l border-border/40 animate-in slide-in-from-right-10 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <FileCode className="w-4 h-4" />
                <span>Generated Files</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodePanel(false)}
                className="h-6 w-6 p-0 hover:bg-[#333]"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {activeFile ? (
                <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed">
                  {fileContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Select a file to view content
                </div>
              )}
            </div>

            {/* Tabs (Bottom) */}
            <div className="flex items-center gap-1 px-2 py-1 bg-[#252526] border-t border-[#333] overflow-x-auto">
              {files.map(file => (
                <button
                  key={file}
                  onClick={() => handleFileClick(file)}
                  className={`px-3 py-1.5 text-xs rounded-t-md transition-colors flex items-center gap-2 ${activeFile === file
                      ? 'bg-[#1e1e1e] text-white border-t-2 border-blue-500'
                      : 'text-gray-400 hover:bg-[#333] hover:text-gray-200'
                    }`}
                >
                  <FileCode className="w-3 h-3" />
                  {file}
                </button>
              ))}
              {files.length === 0 && (
                <span className="text-xs text-gray-500 px-2 py-1">No files generated</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
