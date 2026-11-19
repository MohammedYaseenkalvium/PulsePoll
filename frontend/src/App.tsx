import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthView } from './views/AuthView';
import { DashboardView } from './views/DashboardView';
import { Loader2 } from 'lucide-react';

const MainContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-canvas text-content flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-content-secondary">
          <Loader2 className="w-7 h-7 animate-spin text-primary-500" />
          <span className="text-xs font-medium">Loading PulsePoll...</span>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <DashboardView /> : <AuthView />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;
