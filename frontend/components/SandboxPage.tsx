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
  Sun,
  Moon,
  X,
  MessageSquare,
  Eye,
  Code,
  Download
} from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

interface SandboxPageProps {
  autoRun?: boolean;
  initialPrompt?: string;
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

interface TerminalLog {
  id: string;
  line: string;
  level: string;
  timestamp: string;
}

export const SandboxPage: React.FC<SandboxPageProps> = ({ autoRun = false, initialPrompt = '' }) => {
  const [prompt, setPrompt] = useState(initialPrompt);
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

  // Terminal/Log View State
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [showTerminal, setShowTerminal] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // UI Theme + Responsive State
  const [isLightMode, setIsLightMode] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const theme = {
    container: isLightMode ? 'bg-white text-black' : 'bg-background text-foreground',
    card: isLightMode ? 'bg-white border border-gray-200' : 'bg-black/20 border border-white/10',
    header: isLightMode ? 'bg-white/90' : 'bg-card/30',
    botBubble: isLightMode ? 'bg-gray-100 text-black border border-gray-200' : 'bg-white/10 border border-white/10 text-white',
    input: isLightMode ? 'bg-white text-black border border-gray-200' : 'bg-black/20 text-white border-white/20',
    terminalBg: isLightMode ? 'bg-white text-black' : 'bg-card/10 text-white',
    mutedText: isLightMode ? 'text-black/50' : 'text-white/40'
  };

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

  // Auto-scroll terminal to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

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

  const parseLogLine = (line: string): { level: string; content: string; timestamp: string } => {
    // Parse loguru format: "timestamp | LEVEL | source - message"
    const logPattern = /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d+)\s*\|\s*(\w+)\s*\|(.+)/;
    const match = line.match(logPattern);
    
    if (match) {
      return {
        timestamp: match[1],
        level: match[2],
        content: match[3].trim()
      };
    }
    
    return {
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      content: line
    };
  };

  const getLevelColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'text-red-400';
      case 'WARNING':
        return 'text-yellow-400';
      case 'DEBUG':
        return 'text-blue-400';
      case 'INFO':
        return 'text-green-400';
      default:
        return 'text-white';
    }
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

    // Reset terminal and output panels when starting a new prompt
    setTerminalLogs([]);
    setShowTerminal(true);
    setFiles([]);
    setActiveFile(null);
    setFileContent('');

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
          
          // Fetch latest logs from backend and add to terminal
          fetchLatestLogs();
          // Load output files
          handleShowCode();
          // Save to history after a short delay to ensure files are loaded
          setTimeout(() => saveSessionToHistory(), 500);
          return;
        }

        // Add to terminal logs
        const logParsed = parseLogLine(msg);
        const terminalLog: TerminalLog = {
          id: crypto.randomUUID(),
          line: msg,
          level: logParsed.level,
          timestamp: logParsed.timestamp
        };
        setTerminalLogs(prev => [...prev, terminalLog]);

        // Also add to bot message for conversation view
        setMessages(prev => {
          const lastBotIndex = prev.length - 1 - [...prev].reverse().findIndex(m => m.role === 'bot');

          return prev.map((m, index) => {
            if (index === lastBotIndex && m.role === 'bot') {
              // Check if this is a "Manus's thoughts" message
              if (msg.includes("✨ Manus's thoughts:")) {
                const thoughtContent = msg.replace(/.*✨ Manus's thoughts:\s*/, '').trim();

                if (thoughtContent.length > 150 || thoughtContent.includes('# ')) {
                  return {
                    ...m,
                    content: thoughtContent
                  };
                }
              }

              const currentLogs = m.logs || [];
              const lastLog = currentLogs[currentLogs.length - 1];
              const msgType = getLogType(msg);

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
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  };

  const fetchLatestLogs = async () => {
    try {
      const res = await fetch('http://localhost:8000/logs/latest');
      const data = await res.json();
      
      if (data.lines && Array.isArray(data.lines)) {
        const logs = data.lines
          .filter((line: string) => line.trim())
          .map((line: string) => {
            const parsed = parseLogLine(line);
            return {
              id: crypto.randomUUID(),
              line: line,
              level: parsed.level,
              timestamp: parsed.timestamp
            };
          });
        setTerminalLogs(logs);
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  };

  const saveSessionToHistory = async () => {
    try {
      // Determine the prompt used for the last generation by finding the last user message
      const lastUserMsg = [...messages].slice().reverse().find(m => m.role === 'user');
      const promptText = (lastUserMsg && lastUserMsg.content) ? String(lastUserMsg.content) : '';

      // Get all generated image files
      const imageFiles = files.filter((file) => isImageFile(file));

      // Build messages for history: include the original prompt and one message per generated image as an image URL
      const historyMessages: any[] = [];
      historyMessages.push({
        id: crypto.randomUUID(),
        content: promptText,
        isUser: true,
        timestamp: new Date().toISOString()
      });

      // Add a textual summary message
      historyMessages.push({
        id: crypto.randomUUID(),
        content: `Generated ${imageFiles.length} output(s)`,
        isUser: false,
        timestamp: new Date().toISOString()
      });

      // Add image entries as separate messages containing the server URL to each image
      imageFiles.forEach((f) => {
        historyMessages.push({
          id: crypto.randomUUID(),
          content: `http://localhost:8000/files/${f}`,
          isUser: false,
          timestamp: new Date().toISOString()
        });
      });

      // Build session for history
      const newSession = {
        id: crypto.randomUUID(),
        title: (promptText || '').substring(0, 50) + ((promptText || '').length > 50 ? '...' : ''),
        messages: historyMessages,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        isDraft: false,
        generatedFiles: imageFiles
      };

      // Get existing history
      const existingHistory = localStorage.getItem('nava-ai-chat-history');
      const history = existingHistory ? JSON.parse(existingHistory) : [];

      // Add new session to front
      history.unshift(newSession);

      // Save back to localStorage
      localStorage.setItem('nava-ai-chat-history', JSON.stringify(history));

      console.log('Session saved to history', newSession);
    } catch (e) {
      console.error("Failed to save session to history", e);
    }
  };

  const handleFileClick = async (filename: string) => {
    setActiveFile(filename);
    setIsHtmlPreview(false); // Reset preview mode when switching files

    const isBinaryDoc = (fname: string) => /\.(pdf|pptx|ppt|docx|doc|xlsx|xls|odt|zip)$/i.test(fname);

    if (isBinaryDoc(filename)) {
      setFileContent(''); // Clear content for binary files
      try {
        const res = await fetch(`http://localhost:8000/files/${filename}`);
        if (!res.ok) throw new Error('Failed to fetch file');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (e) {
        console.error('Failed to open binary file in new tab', e);
      }
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/files/${filename}`);

      // If it's an image, we don't need to read as text here; image is displayed via URL
      if (isImageFile(filename)) {
        setFileContent('');
        return;
      }

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
  const isReactFile = (filename: string) => {
    return /\.(jsx|tsx)$/i.test(filename);
  };

  const isBinaryDoc = (filename: string) => /\.(pdf|pptx|ppt|docx|doc|xlsx|xls|odt|zip)$/i.test(filename);

  const isPdfFile = (filename: string) => /\.pdf$/i.test(filename);
  const isDocxFile = (filename: string) => /\.docx?$/i.test(filename);
  const isPptxFile = (filename: string) => /\.pptx?$/i.test(filename);

  const openFileInNewTab = async (filename: string) => {
    try {
      const res = await fetch(`http://localhost:8000/files/${filename}`);
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Failed to open file', e);
      alert('Failed to open file in new tab');
    }
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

  // Render message content with simple code-block handling
  const renderMessageContent = (content?: string) => {
    if (!content) return null;

    // Split content into segments of code blocks ```lang\ncode``` and plain text
    const parts: Array<{ type: 'text' | 'code'; lang?: string; text: string }> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', lang: match[1], text: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', text: content.slice(lastIndex) });
    }

    return (
      <div>
        {parts.map((p, i) => {
          if (p.type === 'code') {
            return (
              <pre key={i} className="rounded-md bg-black/90 p-3 overflow-auto text-xs text-white font-mono my-2">
                <code>{p.text}</code>
              </pre>
            );
          }

          // For plain text, preserve line breaks and simple inline code
          const text = p.text
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .split('\n')
            .map((line, idx) => (
              <span key={idx} dangerouslySetInnerHTML={{ __html: line + (idx < p.text.split('\n').length - 1 ? '<br/>' : '') }} />
            ));

          return <div key={i} className="text-sm leading-relaxed">{text}</div>;
        })}
      </div>
    );
  };

  return (
  <div className={`flex-1 overflow-y-auto px-6 py-4 pt-4 ${theme.container}`}>
    {/* Workspace Card */}
    <div className={`flex flex-col h-[90vh] rounded-2xl ${theme.card} backdrop-blur-md shadow-xl overflow-hidden`}>

      {/* Header */}
      <div className={`px-6 py-2 flex justify-between items-center ${theme.header} backdrop-blur-xl border-b border-border`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg">
            <Terminal className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-white">Manus Sandbox</h1>
            <p className="text-xs text-white/60 font-medium">Run agent tasks & inspect output</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLightMode(prev => !prev)}
            title={isLightMode ? 'Switch to dark' : 'Switch to light'}
            className={`p-1 rounded-md border ${isLightMode ? 'border-gray-200 bg-white' : 'border-transparent bg-white/5'}`}>
            {isLightMode ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-indigo-300" />}
          </button>
        </div>
      </div>

      {/* Workspace Panels */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left - Logs & Chat */}
        <PanelGroup direction={isMobile ? 'vertical' : 'horizontal'} className="w-full">
          <Panel defaultSize={55} minSize={35}>
            <div className="flex flex-col h-full">

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" && "flex-row-reverse"}`}>

                      {/* Avatar */}
                      <div className={`w-8 h-8 flex items-center justify-center rounded-full shadow 
                        ${msg.role === "user" ? "bg-indigo-500 text-white" : "bg-white/10 text-indigo-200"}`}>
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>

                      {/* Message Segments */}
                      <div className="flex flex-col gap-2 w-full">

                        {/* User message */}
                        {msg.role === "user" && (
                          <div className="bg-indigo-500/90 text-white px-4 py-3 rounded-xl shadow-md">
                            {msg.content}
                          </div>
                        )}

                        {/* Bot content */}
                        {msg.role === "bot" && msg.content && (
                          <div className={`px-4 py-3 rounded-lg shadow-sm ${isLightMode ? 'bg-gray-50 border border-gray-200 text-black' : 'bg-white/10 border border-white/10 text-white'}`}>
                            {renderMessageContent(msg.content)}
                          </div>
                        )}

                        {/* Timestamp */}
                        <span className="text-[10px] text-white/40">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef}></div>
              </div>

              {/* Input Bar */}
              <div className={`px-6 py-4 ${isLightMode ? 'bg-white' : 'bg-card/20'} border-t border-border backdrop-blur-lg`}>
                <div className="flex gap-3 max-w-3xl mx-auto">
                  <Input
                    value={prompt}
                    onChange={(e) => { setPrompt(e.target.value); localStorage.setItem("navaSandboxPrompt", e.target.value); }}
                    placeholder="Describe what you want to generate…"
                    className={`${theme.input} rounded-xl placeholder:text-black/40`}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <Button onClick={handleSend} className="rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white">
                    {isGenerating ? <Loader2 className="animate-spin"/> : <Play />}
                  </Button>
                </div>
              </div>

            </div>
          </Panel>

          {/* Output Panel */}
          <PanelResizeHandle className="w-1 bg-white/10 hover:bg-indigo-500 cursor-col-resize" />
          <Panel defaultSize={45} minSize={25}>
            <div className={`flex flex-col h-full ${isLightMode ? 'border-l border-gray-200 bg-white' : 'border-l border-border bg-card/20'} backdrop-blur-xl`}>

              {/* Panel Header with Tabs */}
              <div className="px-4 py-2 border-b border-border flex gap-2">
                <button
                  onClick={() => setShowTerminal(true)}
                  className={`px-3 py-1.5 text-xs rounded-md transition whitespace-nowrap ${
                    showTerminal
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
                      : "text-white/50 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Terminal className="w-3 h-3 inline mr-1" />
                  Terminal
                </button>
                {isDone && (
                  <button
                    onClick={() => setShowTerminal(false)}
                    className={`px-3 py-1.5 text-xs rounded-md transition whitespace-nowrap ${
                      !showTerminal
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
                        : "text-white/50 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <FileCode className="w-3 h-3 inline mr-1" />
                    Output
                  </button>
                )}
              </div>

              {/* Content Area - Single View */}
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* Terminal View */}
                {showTerminal && (
                  <div className={`flex-1 overflow-y-auto ${isLightMode ? 'bg-white text-black' : 'bg-card/10 text-white'} font-mono text-xs`}>
                    <div className="p-4 space-y-0 font-mono">
                      {terminalLogs.length === 0 ? (
                        <div className={`${theme.mutedText} py-8 text-center`}>
                          Waiting for logs...
                        </div>
                      ) : (
                        terminalLogs.map((log) => (
                          <div key={log.id} className={`${getLevelColor(log.level)} hover:bg-white/5 py-0.5 px-2 leading-relaxed`}>
                            <span className={`${isLightMode ? 'text-black/50' : 'text-white/50'}`}>[{log.timestamp}]</span>
                            <span className="ml-2 font-semibold">{log.level}</span>
                            <span className="ml-2">{log.line}</span>
                          </div>
                        ))
                      )}
                      <div ref={terminalEndRef}></div>
                    </div>
                  </div>
                )}

                {/* File Output View */}
                {!showTerminal && isDone && (
                  <>
                    <div className={`flex-1 overflow-auto ${isLightMode ? 'bg-white' : 'bg-black/40'}`}>
                      {!activeFile ? (
                        <div className="h-full flex items-center justify-center text-white/40 text-sm">
                          No file selected
                        </div>
                      ) : (
                        <>
                          {isImageFile(activeFile) && (
                            <div className="h-full flex items-center justify-center p-4">
                              <img
                                src={`http://localhost:8000/files/${activeFile}`}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          )}
                          {!isImageFile(activeFile) && (
                            <>
                              {isBinaryDoc(activeFile) ? (
                                <div className="p-6 text-sm text-muted-foreground">
                                  <p className="mb-3">This file is a binary document and cannot be previewed inline.</p>
                                  <div className="flex gap-2">
                                    <button onClick={() => openFileInNewTab(activeFile)} className="px-3 py-1 rounded-md bg-indigo-600 text-white">Open in new tab</button>
                                    <a href={`http://localhost:8000/files/${activeFile}`} target="_blank" rel="noreferrer" download className="px-3 py-1 rounded-md bg-white/10 text-white">Download</a>
                                  </div>
                                </div>
                              ) : (
                                  <pre className={`p-4 text-xs ${isLightMode ? 'text-black' : 'text-white'} font-mono leading-relaxed whitespace-pre-wrap break-words`}>
                                    {fileContent}
                                  </pre>
                                )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* File Tabs - Only Images */}
                    <div className="flex gap-1 px-2 py-1 bg-card/10 border-t border-border overflow-x-auto max-h-10">
                      {files.filter((file) => isImageFile(file)).map((file) => (
                        <button key={file} onClick={() => handleFileClick(file)}
                          className={`px-2 py-0.5 text-xs rounded-md truncate transition whitespace-nowrap flex-shrink-0
                            ${activeFile === file ? "bg-black text-indigo-400 border-b-2 border-indigo-500"
                            : "text-white/50 hover:text-white hover:bg-white/10"}`}>
                          {file}
                        </button>
                      ))}
                    </div>
                  </>
                )}

              </div>

            </div>
          </Panel>
        </PanelGroup>

      </div>
    </div>
  </div>
  );
};
