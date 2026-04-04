import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessionToken, setSessionToken] = useState(
    () => localStorage.getItem('dv_session') || null
  );
  const [user, setUser] = useState(null);

  const login = useCallback((token, userData) => {
    localStorage.setItem('dv_session', token);
    setSessionToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dv_session');
    setSessionToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await api.getMe(sessionToken);
      setUser(data.user);
    } catch (err) {
      // Only logout on auth failure (401), not network/server errors
      if (err.status === 401) logout();
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
