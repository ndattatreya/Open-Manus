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

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const message = data.message?.trim() || '';

      if (message.startsWith('🧠')) {
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Received Prompt', description: [message], icon: Terminal }]);
      } else if (message.startsWith('⚙️')) {
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Processing', description: [message], icon: Settings }]);
      } else if (message.startsWith('🧩')) {
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Reasoning', description: [], icon: Code }]);
      } else if (message.startsWith('💡 OUTPUT_START')) {
        hasOutputStarted = true;
        outputBuffer = '';
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Generating Output', description: ['Streaming output...'], icon: Code }]);
      } else if (message.startsWith('💡 OUTPUT_END')) {
        setFinalOutput(outputBuffer.trim());
        setSteps(prev => prev.map(s => s.title === 'Generating Output' ? { ...s, title: 'Output Complete', icon: CheckCircle } : s));
      } else if (message.startsWith('💡')) {
        const cleaned = message.replace(/^💡\s?/, '');
        outputBuffer += cleaned + '\n';
      } else if (message.startsWith('✅')) {
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Completed', description: [message], icon: CheckCircle }]);
        finished = true;
        eventSource.close();
        setIsGenerating(false);
      } else if (message.startsWith('❌')) {
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Error', description: [message], icon: Square }]);
        setFinalOutput(`Error: ${message}`);
        finished = true;
        eventSource.close();
        setIsGenerating(false);
      }
    };

    eventSource.onerror = (e) => {
      if (!finished) {
        console.warn('⚠️ Stream connection lost:', e);
        setSteps(prev => [...prev, { id: prev.length + 1, title: 'Connection Lost', description: ['Stream was interrupted.'], icon: Square }]);
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

      <div className="flex-1 flex">
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

          <div className="flex-1 p-6 bg-card/80 rounded-xl overflow-y-auto space-y-3">
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
        <div className="w-1/2 flex flex-col">
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

          <div className="flex-1 bg-card/80 rounded-xl overflow-auto">
            {isGenerating ? (
              <p className="text-sm text-muted-foreground italic">Generating... please wait.</p>
            ) : finalOutput.includes('slidesgpt.com') ? (
              <div className="p-4 text-sm">
                <p>🎉 Presentation Ready!</p>
                <a href={finalOutput.match(/https?:\/\/[^\s)]+/g)?.[0]} target="_blank" rel="noopener noreferrer" className="text-[#7B61FF] underline">
                  Open in SlidesGPT
                </a>
              </div>
            ) : finalOutput ? (
              <SyntaxHighlighter
                language="cpp"
                style={isDarkMode() ? darkStyle : lightStyle}
                customStyle={{
                  borderRadius: "10px",
                  padding: "16px",
                  fontSize: "0.85rem",
                  background: isDarkMode() ? "#1e1e1e" : "#f5f5f5"
                }}
              >
                {finalOutput}
              </SyntaxHighlighter>
            ) : (
              <p className="text-sm text-muted-foreground">Output will appear here...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
