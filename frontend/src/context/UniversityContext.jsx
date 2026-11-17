import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthApi } from '../services/api';

const UniversityContext = createContext(null);
const STORAGE_KEY = 'lfc.university_code';

/**
 * Public visitors can switch institution; the choice is persisted and used as
 * the `university_code` query parameter. The backend always re-validates it and
 * never trusts it for authorisation.
 */
export function UniversityProvider({ children }) {
  const [universities, setUniversities] = useState([]);
  const [code, setCode] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AuthApi.universities();
      const list = data.universities || [];
      setUniversities(list);
      setCode((current) => {
        if (current && list.some((u) => u.code === current)) return current;
        return list[0]?.code || '';
      });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (code) localStorage.setItem(STORAGE_KEY, code);
  }, [code]);

  const value = useMemo(() => {
    const active = universities.find((u) => u.code === code) || universities[0] || null;
    return { universities, active, code: active?.code || code, setCode, loading, error, reload: load };
  }, [universities, code, loading, error, load]);

  return <UniversityContext.Provider value={value}>{children}</UniversityContext.Provider>;
}

export function useUniversity() {
  const context = useContext(UniversityContext);
  if (!context) throw new Error('useUniversity must be used inside <UniversityProvider>');
  return context;
}
