import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeProvider";

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function DashboardLayout({
  children,
  currentPage,
  onNavigate,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAppPreview, setShowAppPreview] = useState(false);

  const { signOut } = useClerk();
  const navigate = useNavigate();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);
  const toggleAppPreview = () => setShowAppPreview(!showAppPreview);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen flex">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
        />

        <div className="flex-1 flex flex-col min-h-screen">
          <Navbar
            onToggleSidebar={toggleSidebar}
            onToggleAppPreview={toggleAppPreview}
            showAppPreview={showAppPreview}
            onLogout={handleLogout}
          />

          {/* ✅ This renders ONLY the current page (home/sandbox/history/pricing/etc.) */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
