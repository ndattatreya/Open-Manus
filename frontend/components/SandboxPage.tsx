import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Clock, Code, Loader2, CheckCircle, Square, Terminal, Settings, Share, Download, Play, Search, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as darkStyle } from "react-syntax-highlighter/dist/esm/styles/prism";
import { vs as lightStyle } from "react-syntax-highlighter/dist/esm/styles/prism";

interface SandboxPageProps {
  autoRun?: boolean;
}

export const SandboxPage: React.FC<SandboxPageProps> = ({ autoRun = false }) => {
  console.log("Auto-run:", autoRun);
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [finalOutput, setFinalOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    // ✅ Prefill prompt from HomePage if user came via "code" or "ppt" request
    const savedPrompt = localStorage.getItem('sandboxPrompt');
    if (savedPrompt) {
      setPrompt(savedPrompt);
      localStorage.removeItem('sandboxPrompt'); // optional cleanup
    }
  }, []);

  async function generateTextOrCode(prompt) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

    setSteps([{ id: 1, title: 'Processing Prompt', description: ['Sending request to LLM...'], icon: Play }]);

    const res = await fetch(`${backendUrl}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || "Text generation failed");
    }

    const data = await res.json();
    setFinalOutput(data.output || JSON.stringify(data, null, 2));

    setSteps((prev) => [
      ...prev,
      { id: 2, title: '✅ Completed', description: ['Text/code generation finished.'], icon: Play },
    ]);
  }


  const handleGenerate = async () => {
  if (!prompt.trim()) return;

  setIsGenerating(true);
  setSteps([]);
  setFinalOutput('');
  setImageUrl(null); // clear old image

  try {
    const lowerPrompt = prompt.toLowerCase();

    // ✅ Detect if the user wants an image
    const isImageRequest =
      lowerPrompt.includes('image') ||
      lowerPrompt.includes('photo') ||
      lowerPrompt.includes('picture') ||
      lowerPrompt.includes('draw') ||
      lowerPrompt.includes('illustration');

    // ✅ Normalize backend URL (remove trailing slash)
    const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8000").replace(/\/$/, '');

    if (isImageRequest) {
      // 🖼️ Image generation flow
      setSteps([{ id: 1, title: 'Image Generation', description: ['Generating your image...'], icon: Play }]);

      const res = await fetch(`${backendUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: "1024x1024" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `Failed to generate image (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      setSteps((prev) => [
        ...prev,
        { id: 2, title: '✅ Completed', description: ['Image generated successfully.'], icon: Play },
      ]);

    } else {
      // 🧠 Normal text/code generation
      await generateTextOrCode(prompt);
    }
  } catch (err) {
    console.error("⚠️ Generation error:", err);
    setSteps((prev) => [
      ...prev,
      { id: 99, title: 'Error', description: [err.message || 'Unexpected error'], icon: Play },
    ]);
  } finally {
    setIsGenerating(false);
  }
};

  const isDarkMode = () =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl mb-1">Sandbox</h1>
          {autoRun && <p>Auto-running your sandbox...</p>}
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
            ) : imageUrl ? (
              <div className="flex justify-center mt-4">
                <img
                  src={imageUrl}
                  alt="Generated by AI"
                  className="rounded-xl shadow-md w-full max-w-md"
                />
              </div>
            ) : finalOutput ? (
              <>
                {/* existing SyntaxHighlighter + iframe preview */}
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
