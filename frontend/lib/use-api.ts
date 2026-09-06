import { useEffect, useState } from 'react';
import { apiGet } from './api';

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); apiGet<T>(path).then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [path]);
  return { data, error, loading };
}
