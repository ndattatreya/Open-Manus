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
  X,
  MessageSquare,
  Eye,
  Code,
  Download
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

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
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // File Viewer State
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isHtmlPreview, setIsHtmlPreview] = useState(false);

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

  const handleSend = () => {
    if (!prompt.trim()) return;

    if (isWaitingForInput && wsRef.current) {
      // Send user response to the running agent
      console.log('📨 Sending user response:', prompt);
      const response = JSON.stringify({ type: 'user_input', content: prompt });
      console.log('📨 Formatted response:', response);
      wsRef.current.send(response);

      // Add user message to chat
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: new Date()
      };

      // Create a new bot message for subsequent logs
      const newBotMsgId = crypto.randomUUID();
      const newBotMsg: ChatMessage = {
        id: newBotMsgId,
        role: 'bot',
        logs: [],
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMsg, newBotMsg]);

      // Update the botMsgId ref so new logs go to the new message
      // We need to store this in a ref or state that handleGenerate can access
      // For now, we'll use a workaround by finding the last bot message

      // Reset input state
      setPrompt('');
      setIsWaitingForInput(false);
      setInputPrompt('');
    } else {
      // Start new generation
      handleGenerate();
    }
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
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to server');
        ws.send(prompt);
        setPrompt(''); // Clear prompt after sending
      };

      ws.onmessage = (event) => {
        const rawMsg = event.data;

        // Check for JSON message (Input Request)
        try {
          if (rawMsg.startsWith('{')) {
            const data = JSON.parse(rawMsg);
            console.log('📩 Received JSON message:', data);
            if (data.type === 'input_request') {
              console.log('❓ Input request detected:', data.content);
              setIsWaitingForInput(true);
              setInputPrompt(data.content);

              // Add bot message with the question
              const questionMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'bot',
                content: data.content,
                timestamp: new Date()
              };
              setMessages(prev => [...prev, questionMsg]);
              return;
            }
          }
        } catch (e) {
          // Not JSON, treat as log string
        }

        const msg = rawMsg;

        if (msg === "DONE") {
          setIsGenerating(false);
          setIsDone(true);
          ws.close();
          wsRef.current = null;
          return;
        }

        setMessages(prev => {
          // Find the last bot message to append logs to
          const lastBotIndex = prev.length - 1 - [...prev].reverse().findIndex(m => m.role === 'bot');

          return prev.map((m, index) => {
            // Only append to the last bot message, not the original botMsgId
            if (index === lastBotIndex && m.role === 'bot') {
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
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (isGenerating) setIsGenerating(false);
        wsRef.current = null;
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
    setIsHtmlPreview(false); // Reset preview mode when switching files

    if (isPptxFile(filename)) {
      setFileContent(''); // Clear content for binary files
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/files/${filename}`);
      const content = await res.text();

      if (isReactFile(filename)) {
        // Try to fetch index.css or App.css
        let cssContent = '';
        try {
          const cssRes = await fetch(`http://localhost:8000/files/index.css`);
          if (cssRes.ok) cssContent = await cssRes.text();
        } catch (e) { /* ignore */ }

        // If preview is active, update it
        if (isHtmlPreview) {
          setFileContent(getReactPreviewContent(content, cssContent));
        } else {
          setFileContent(content);
        }
      } else {
        setFileContent(content);
      }
    } catch (e) {
      console.error("Failed to fetch file content", e);
    }
  };

  const isImageFile = (filename: string) => {
    return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
  };

  const isHtmlFile = (filename: string) => {
    return /\.html?$/i.test(filename);
  };

  const isPptxFile = (filename: string) => {
    return /\.pptx$/i.test(filename);
  };

  const isReactFile = (filename: string) => {
    return /\.(jsx|tsx)$/i.test(filename);
  };

  const getReactPreviewContent = (code: string, css: string = '') => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            ${css}
            body { margin: 0; font-family: sans-serif; }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <script type="text/babel">
            // Mock exports/imports for standalone execution
            const exports = {};
            const require = (module) => {
              if (module === 'react') return React;
              if (module === 'react-dom/client') return ReactDOM;
              if (module === 'lucide-react') return {}; // Mock lucide
              return {};
            };

            // Helper to handle default exports
            function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

            try {
              ${code.replace(/import\s+.*?from\s+['"].*?['"];?/g, '') // Naive strip imports
        .replace(/export\s+default\s+/, 'const App = ') // Handle default export
        .replace(/export\s+/, '')} // Handle named exports

              const root = ReactDOM.createRoot(document.getElementById('root'));
              // Try to find the component to render (assuming App or the last defined function)
              if (typeof App !== 'undefined') {
                root.render(<App />);
              } else {
                root.render(<div className="p-4 text-red-500">Could not find 'App' component to render. Ensure you export default App.</div>);
              }
            } catch (err) {
              document.getElementById('root').innerHTML = '<div class="text-red-500 p-4"><h3 class="font-bold">Preview Error:</h3><pre>' + err.message + '</pre></div>';
            }
          </script>
        </body>
      </html>
    `;
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-foreground font-sans selection:bg-primary/20">
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
        <PanelGroup direction="horizontal" className="h-full w-full">
          {/* Chat Area */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">
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
                              {/* Text Content (e.g. Questions) */}
                              {msg.content && (
                                <div className="bg-zinc-800/50 text-foreground px-5 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-border/50">
                                  <p className="text-sm leading-relaxed">{msg.content}</p>
                                </div>
                              )}

                              {msg.logs?.length === 0 && isGenerating && !msg.content && (
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
                    placeholder={isWaitingForInput ? (inputPrompt || "Manus is asking for input...") : "Describe your task..."}
                    className={`flex-1 bg-muted/50 border-transparent focus:bg-background focus:border-primary/20 transition-all shadow-inner ${isWaitingForInput ? 'border-primary/50 ring-1 ring-primary/20' : ''
                      }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (!isGenerating || isWaitingForInput)) handleSend();
                    }}
                    disabled={isGenerating && !isWaitingForInput}
                    autoFocus={isWaitingForInput}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isGenerating && !isWaitingForInput}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/20 transition-all px-6"
                  >
                    {isGenerating && !isWaitingForInput ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isWaitingForInput ? (
                      <MessageSquare className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          {/* Code Panel (Right Side) */}
          {showCodePanel && (
            <>
              <PanelResizeHandle className="w-1 bg-border/40 hover:bg-primary/50 transition-colors cursor-col-resize" />
              <Panel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-border/40 min-w-0">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333] flex-shrink-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <FileCode className="w-4 h-4" />
                        <span>Generated Files</span>
                      </div>
                      {activeFile && (isHtmlFile(activeFile) || isReactFile(activeFile)) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const newPreviewState = !isHtmlPreview;
                            setIsHtmlPreview(newPreviewState);

                            // If switching TO preview mode and it's a React file, we need to generate the preview content
                            if (newPreviewState && isReactFile(activeFile!) && activeFile) {
                              try {
                                const res = await fetch(`http://localhost:8000/files/${activeFile}`);
                                const code = await res.text();

                                let cssContent = '';
                                try {
                                  const cssRes = await fetch(`http://localhost:8000/files/index.css`);
                                  if (cssRes.ok) cssContent = await cssRes.text();
                                } catch (e) { /* ignore */ }

                                setFileContent(getReactPreviewContent(code, cssContent));
                              } catch (e) {
                                console.error("Error generating preview", e);
                              }
                            } else if (!newPreviewState && activeFile) {
                              // Switching back to code view, fetch raw content
                              const res = await fetch(`http://localhost:8000/files/${activeFile}`);
                              const content = await res.text();
                              setFileContent(content);
                            }
                          }}
                          className="h-7 px-2 hover:bg-[#333] text-xs text-gray-300 flex items-center gap-1"
                          title={isHtmlPreview ? 'View Code' : 'Preview'}
                        >
                          {isHtmlPreview ? (
                            <>
                              <Code className="w-3 h-3" />
                              <span>Code</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCodePanel(false)}
                      className="h-6 w-6 p-0 hover:bg-[#333] flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden min-h-0 min-w-0">
                    {activeFile ? (
                      <>
                        {isImageFile(activeFile) ? (
                          <div className="h-full w-full overflow-auto p-4 flex items-center justify-center bg-[#1a1a1a]">
                            <img
                              src={`http://localhost:8000/files/${activeFile}`}
                              alt={activeFile}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ) : (isHtmlFile(activeFile) || isReactFile(activeFile)) && isHtmlPreview ? (
                          <div className="h-full w-full overflow-auto bg-white">
                            <iframe
                              srcDoc={fileContent}
                              className="w-full h-full border-none"
                              title="Preview"
                              sandbox="allow-scripts allow-same-origin"
                            />
                          </div>
                        ) : isPptxFile(activeFile) ? (
                          <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                            <div className="p-4 bg-primary/10 rounded-full">
                              <FileCode className="w-12 h-12 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-lg font-medium text-foreground">PowerPoint Presentation</h3>
                              <p className="text-sm text-muted-foreground mt-1">This file cannot be previewed directly.</p>
                            </div>
                            <Button
                              onClick={() => window.open(`http://localhost:8000/files/${activeFile}`, '_blank')}
                              className="gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Download File
                            </Button>
                          </div>
                        ) : (
                          <div className="h-full w-full overflow-auto min-w-0">
                            <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-words min-w-0">
                              {fileContent}
                            </pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                        Select a file to view content
                      </div>
                    )}
                  </div>

                  {/* Tabs (Bottom) */}
                  <div className="flex items-center gap-1 px-2 py-1 bg-[#252526] border-t border-[#333] overflow-x-auto flex-shrink-0">
                    {files.map(file => (
                      <button
                        key={file}
                        onClick={() => handleFileClick(file)}
                        title={file}
                        className={`px-3 py-1.5 text-xs rounded-t-md transition-colors flex items-center gap-2 max-w-[120px] ${activeFile === file
                          ? 'bg-[#1e1e1e] text-white border-t-2 border-blue-500'
                          : 'text-gray-400 hover:bg-[#333] hover:text-gray-200'
                          }`}
                      >
                        <FileCode className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{file}</span>
                      </button>
                    ))}
                    {files.length === 0 && (
                      <span className="text-xs text-gray-500 px-2 py-1">No files generated</span>
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
};
