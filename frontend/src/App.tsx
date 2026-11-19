import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { ParticipantVoteView } from './views/ParticipantVoteView';
import { LiveMonitorView } from './views/LiveMonitorView';
import { Loader2 } from 'lucide-react';

const MainContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // 1. Live Monitor route: /poll/:id/live
  const liveMatch = currentPath.match(/^\/poll\/([^/]+)\/live\/?$/);
  if (liveMatch) {
    const pollId = liveMatch[1];
    return <LiveMonitorView pollId={pollId} onBack={() => navigateTo('/')} />;
  }

  // 2. Participant voting route: /vote/:shareSlug or /poll/:shareSlug
  const voteMatch = currentPath.match(/^\/(?:vote|poll)\/([^/]+)\/?$/);
  if (voteMatch) {
    const shareSlug = voteMatch[1];
    return <ParticipantVoteView shareSlug={shareSlug} onNavigateHome={() => navigateTo('/')} />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-canvas text-content flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-content-secondary">
          <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
          <span className="text-xs font-semibold">Connecting to PulsePoll...</span>
        </div>
      </div>
    );
  }

  // 3. Root route: / -> Dashboard (if logged in) or AuthView (if not logged in)
  return isAuthenticated ? (
    <DashboardView onNavigateToLive={(pollId) => navigateTo(`/poll/${pollId}/live`)} />
  ) : (
    <AuthView />
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;
