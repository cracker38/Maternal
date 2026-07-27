import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('rmdp_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('rmdp_token'));

  const login = useCallback(async (payload) => {
    const data = await api('/auth/login', { method: 'POST', body: payload });
    localStorage.setItem('rmdp_token', data.token);
    localStorage.setItem('rmdp_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    localStorage.removeItem('rmdp_token');
    localStorage.removeItem('rmdp_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, token, login, logout, isAuthenticated: !!token }), [user, token, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
