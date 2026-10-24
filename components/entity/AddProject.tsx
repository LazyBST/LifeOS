'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createProjectAction } from '@/app/actions/projects';

/** Small inline "Add project" control for the Goal page. */
export function AddProject({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const t = title.trim();
    if (!t) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await createProjectAction({ goal_id: goalId, title: t });
      if (!res.ok) {
        toast.error(res.error || 'Could not create project');
        return;
      }
      setTitle('');
      setOpen(false);
      router.push(`/projects/${res.data.id}`);
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add project
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={title}
        placeholder="Project title"
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setTitle('');
            setOpen(false);
          }
        }}
        className="h-8 w-56"
      />
      <Button type="button" size="sm" disabled={pending} onClick={submit}>
        Add
      </Button>
    </div>
  );
}

export default AddProject;
