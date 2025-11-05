import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Clock, Code, Loader2, CheckCircle, Square, Terminal, Settings, Share, Download, Play, Search, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as darkStyle } from "react-syntax-highlighter/dist/esm/styles/prism";
import { vs as lightStyle } from "react-syntax-highlighter/dist/esm/styles/prism";

export function SandboxPage() {
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [finalOutput, setFinalOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // ✅ Prefill prompt from HomePage if user came via "code" or "ppt" request
    const savedPrompt = localStorage.getItem('sandboxPrompt');
    if (savedPrompt) {
      setPrompt(savedPrompt);
      localStorage.removeItem('sandboxPrompt'); // optional cleanup
    }
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setSteps([]);
    setFinalOutput('');

    // ✅ Check if user requested PPT generation
    const lowerPrompt = prompt.toLowerCase();
    const isPPTRequest =
      lowerPrompt.includes('ppt') ||
      lowerPrompt.includes('presentation') ||
      lowerPrompt.includes('slides');

    if (isPPTRequest) {
      setSteps([
        { id: 1, title: 'Initializing SlidesGPT', description: ['Connecting to SlidesGPT API...'], icon: Loader2 },
      ]);

      try {
        const response = await fetch('http://localhost:5000/api/presentation/generate-ppt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        const data = await response.json();

        if (response.ok) {
          setSteps(prev => [
            ...prev,
            { id: 2, title: 'Presentation Generated', description: ['SlidesGPT finished generating your slides!'], icon: CheckCircle },
          ]);
          setFinalOutput(`✅ Presentation ready!\n\n🔗 [View Online](${data.embedUrl})\n📥 [Download PPTX](${data.downloadUrl})`);
        } else {
          setSteps(prev => [
            ...prev,
            { id: 2, title: 'Error', description: [data.error || 'SlidesGPT failed to generate presentation.'], icon: Square },
          ]);
          setFinalOutput('❌ Failed to generate PPT.');
        }
      } catch (err) {
        setSteps(prev => [
          ...prev,
          { id: 2, title: 'Error', description: ['Could not connect to backend.'], icon: Square },
        ]);
        setFinalOutput('⚠️ Network error while generating PPT.');
      } finally {
        setIsGenerating(false);
      }

      return; // stop here — no normal AI stream
    }

    // 🧠 Else: use your normal LLM stream generation
    const eventSource = new EventSource(`http://localhost:8000/stream?prompt=${encodeURIComponent(prompt)}`);
    let outputBuffer = '';
    let hasOutputStarted = false;
    let finished = false;

    eventSource.addEventListener('end', () => {
      finished = true;
      eventSource.close();
    });

    // ✅ Fixed: no JSON.parse, just handle raw text
    eventSource.onmessage = (event) => {
      const message = (event.data || '').trim();

      if (!message) return;

      // 🧠 Prompt received
      if (message.startsWith('🧠')) {
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Received Prompt', description: [message], icon: Terminal },
        ]);

        // ⚙️ Processing step
      } else if (message.startsWith('⚙️')) {
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Processing', description: [message], icon: Settings },
        ]);

        // 🧩 Reasoning step
      } else if (message.startsWith('🧩')) {
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Reasoning', description: [message], icon: Code },
        ]);

        // 💡 Output section begins
      } else if (message.startsWith('💡 OUTPUT_START')) {
        hasOutputStarted = true;
        outputBuffer = '';
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Generating Output', description: ['Streaming output...'], icon: Code },
        ]);

        // 💡 Output section ends
      } else if (message.startsWith('💡 OUTPUT_END')) {
        setFinalOutput(outputBuffer.trim());
        setSteps(prev =>
          prev.map(s =>
            s.title === 'Generating Output'
              ? { ...s, title: 'Output Complete', icon: CheckCircle }
              : s
          )
        );

        // 💡 Streaming output lines
      } else if (message.startsWith('💡')) {
        const cleaned = message.replace(/^💡\s?/, '');
        outputBuffer += cleaned + '\n';

        // ✅ Show code progressively like a live typing effect
        setFinalOutput(prev => prev + cleaned + '\n');

        // ✅ Completed
      } else if (message.startsWith('✅')) {
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Completed', description: [message], icon: CheckCircle },
        ]);
        finished = true;
        eventSource.close();
        setIsGenerating(false);

        // ❌ Error
      } else if (message.startsWith('❌')) {
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Error', description: [message], icon: Square },
        ]);
        setFinalOutput(`Error: ${message}`);
        finished = true;
        eventSource.close();
        setIsGenerating(false);
      }
    };

    // ⚠️ Handle disconnection
    eventSource.onerror = (e) => {
      if (!finished) {
        console.warn('⚠️ Stream connection lost:', e);
        setSteps(prev => [
          ...prev,
          { id: prev.length + 1, title: 'Connection Lost', description: ['Stream was interrupted.'], icon: Square },
        ]);
      }
      eventSource.close();
      setIsGenerating(false);
    };
  };


  const isDarkMode = () =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl mb-1">Sandbox</h1>
          <p className="text-muted-foreground">Experiment, test, and refine your AI prompts here</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline"><Share className="w-4 h-4 mr-2" />Share</Button>
          <Button variant="outline"><Download className="w-4 h-4 mr-2" />Export</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden h-[calc(100vh-8rem)]">
        {/* Steps Panel */}
        <div className="w-1/2 flex flex-col">
          <div className="p-4 bg-muted/20 flex items-center justify-between">
            <h3 className="font-medium flex items-center">
              <Clock className="w-4 h-4 mr-2 text-[#7B61FF]" /> Generation Steps
            </h3>
            {isGenerating ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#7B61FF]" /> Generating...
              </div>
            ) : (
              <div className="text-sm text-green-500">Ready</div>
            )}
          </div>

          <div className="flex-1 p-6 bg-card/80 rounded-xl overflow-y-auto space-y-3 h-full">
            {steps.map((s) => (
              <div key={s.id} className="flex items-start space-x-2">
                <s.icon className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.description.join('\n')}</p>
                </div>
              </div>
            ))}

            <div className="p-4 border-t border-border/30">
              <div className="flex items-center space-x-3 bg-muted/30 rounded-lg p-3">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt..."
                  className="flex-1 bg-transparent border-none focus:ring-0"
                />
                <Button onClick={handleGenerate} className="bg-gradient-to-r from-[#7B61FF] to-[#9F7AEA] text-white">
                  <Play className="w-3 h-3 mr-1" /> Generate
                </Button>
              </div>
            </div>
          </div>

        </div>

        {/* Output Panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="p-4 bg-muted/20 flex justify-between items-center">
            <h3 className="font-medium flex items-center">
              <Code className="w-4 h-4 mr-2 text-[#7B61FF]" /> Output
            </h3>
            {finalOutput && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(finalOutput);
                  const btn = document.activeElement as HTMLButtonElement;
                  const originalText = btn.innerText;
                  btn.innerText = 'Copied!';
                  setTimeout(() => {
                    btn.innerText = originalText;
                  }, 2000);
                }}
              >
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            )}
          </div>

          <div
            className="flex-1 bg-card/80 rounded-xl overflow-auto p-4"
            style={{
              maxHeight: "70vh", // keeps it from taking full screen height
              overflowY: "auto",
              overflowX: "hidden",
              wordWrap: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {isGenerating ? (
              <p className="text-sm text-muted-foreground italic">
                Generating... please wait for steps to finish.
              </p>
            ) : finalOutput ? (
              <>
                <div
                  style={{
                    maxHeight: "60vh",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <SyntaxHighlighter
                    language="html"
                    style={isDarkMode() ? darkStyle : lightStyle}
                    customStyle={{
                      borderRadius: "10px",
                      padding: "16px",
                      fontSize: "0.85rem",
                      background: isDarkMode() ? "#1e1e1e" : "#f5f5f5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {finalOutput}
                  </SyntaxHighlighter>
                </div>

                {/* Optional: Live preview for HTML */}
                {(finalOutput.toLowerCase().includes("<html") ||
                  finalOutput.toLowerCase().includes("<body") ||
                  finalOutput.toLowerCase().includes("<div")) && (
                    <div className="mt-4 border-t border-border/30 pt-3">
                      <h4 className="text-sm font-medium mb-2 text-foreground/80">
                        🔍 Live Preview:
                      </h4>
                      <iframe
                        title="Live Preview"
                        srcDoc={finalOutput}
                        sandbox="allow-scripts allow-same-origin"
                        style={{
                          width: "100%",
                          height: "400px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "#fff",
                          overflow: "hidden",
                        }}
                      />
                    </div>
                  )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Output will appear here...</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
