'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'lifeos:theme';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setIsDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="touch-target"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export default ThemeToggle;
