import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessionToken, setSessionToken] = useState(
    () => sessionStorage.getItem('dv_session') || null
  );
  const [user, setUser] = useState(null);

  const login = useCallback((token, userData) => {
    sessionStorage.setItem('dv_session', token);
    setSessionToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('dv_session');
    setSessionToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await api.getMe(sessionToken);
      setUser(data.user);
    } catch {
      logout();
    }
  }, [sessionToken, logout]);

  return (
    <AuthContext.Provider value={{ sessionToken, user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
