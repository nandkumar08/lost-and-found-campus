import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthApi, NotificationApi, getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [unread, setUnread] = useState(0);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setBooting(false);
      return null;
    }
    try {
      const me = await AuthApi.me();
      setUser(me);
      setUnread(me.counters?.unread_notifications || 0);
      return me;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setToken('');
      }
      setUser(null);
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email, password) => {
    const result = await AuthApi.login({ email, password });
    setToken(result.access_token);
    const me = await refreshMe();
    return me || result.user;
  }, [refreshMe]);

  const logout = useCallback(() => {
    setToken('');
    setUser(null);
    setUnread(0);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!getToken()) return;
    try {
      const data = await NotificationApi.list({ page_size: 1 });
      setUnread(data.unread || 0);
    } catch (_) {
      /* non-critical */
    }
  }, []);

  const value = useMemo(() => {
    const role = user?.role || '';
    const permissions = user?.permissions || [];
    return {
      user,
      booting,
      unread,
      login,
      logout,
      refreshMe,
      refreshNotifications,
      setUnread,
      role,
      isAuthed: Boolean(user),
      can: (permission) => permissions.includes(permission),
      isStudent: ['student', 'faculty', 'university_staff', 'campus_member'].includes(role),
      isSecurity: role === 'security_personnel',
      isUniversityAdmin: role === 'university_admin',
      isPlatformAdmin: role === 'platform_admin',
      isStaff: ['security_personnel', 'university_admin'].includes(role),
      isVerified: user?.verification_status === 'verified' ||
        ['security_personnel', 'university_admin', 'platform_admin'].includes(role)
    };
  }, [user, booting, unread, login, logout, refreshMe, refreshNotifications]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
