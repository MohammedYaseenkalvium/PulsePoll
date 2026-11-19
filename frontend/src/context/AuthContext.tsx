import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getStoredToken, setStoredToken, type UserProfile } from '../lib/api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('pulsepoll_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Validate and load profile if token is present
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      const stored = getStoredToken();
      if (!stored) {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const profile = await api.getMe();
        if (isMounted) {
          setUser(profile);
          localStorage.setItem('pulsepoll_user', JSON.stringify(profile));
        }
      } catch {
        // Token invalid or expired
        if (isMounted) {
          setStoredToken(null);
          setToken(null);
          setUser(null);
          localStorage.removeItem('pulsepoll_user');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem('pulsepoll_user', JSON.stringify(res.user));
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const res = await api.register({ email, username, password });
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    localStorage.setItem('pulsepoll_user', JSON.stringify(res.user));
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem('pulsepoll_user');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
