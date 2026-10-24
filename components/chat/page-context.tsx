'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PageContext } from '@/lib/types/db';

const EMPTY: PageContext = { route: '/', entity_type: 'none' };

type Ctx = { page: PageContext; setPage: (p: PageContext) => void };
const PageCtx = createContext<Ctx>({ page: EMPTY, setPage: () => {} });

export function PageContextProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageContext>(EMPTY);
  const value = useMemo(() => ({ page, setPage }), [page]);
  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>;
}

export function usePageContext(): PageContext {
  return useContext(PageCtx).page;
}

/** Registers the current page with the chat panel. Entity pages render
 *  <SetPageContext ctx={{...}} /> so the agent knows where the user is. */
export function SetPageContext({ ctx }: { ctx: PageContext }) {
  const { setPage } = useContext(PageCtx);
  const key = JSON.stringify(ctx);
  useEffect(() => {
    setPage(JSON.parse(key) as PageContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
