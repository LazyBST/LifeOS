// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { CopyButton, copyText } from '@/components/chat/CopyButton';
import { Sidebar } from '@/components/shell/Sidebar';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); delete (window as unknown as { __lifeosChatOpen?: boolean }).__lifeosChatOpen; });

describe('CopyButton', () => {
  it('copies the text and shows a tick', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton text="Created task: Fix login" />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Copy message')); });
    expect(writeText).toHaveBeenCalledWith('Created task: Fix login');
    expect(screen.getByLabelText('Copied')).toBeTruthy();
  });
  it('falls back to a textarea when the Clipboard API is missing', async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn(() => true);
    expect(await copyText('hello')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

const areas = [{ id: 'a', name: 'Business', slug: 'business', color: '#6366f1' }];
describe('Sidebar collapse', () => {
  it('collapses and expands from the bottom arrow, and remembers it', () => {
    render(<Sidebar areas={areas} />);
    expect(screen.getByText('Business')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.queryByText('Business')).toBeNull();
    expect(screen.getByLabelText('Business')).toBeTruthy(); // icon rail keeps accessible names
    expect(localStorage.getItem('lifeos:sidebar:collapsed')).toBe('1');
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(screen.getByText('Business')).toBeTruthy();
  });
  it('folds away when the chat opens, and comes back when it closes', () => {
    render(<Sidebar areas={areas} />);
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: true } })); });
    expect(screen.queryByText('Business')).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: false } })); });
    expect(screen.getByText('Business')).toBeTruthy();
  });
  it('stays collapsed after the chat closes if you had collapsed it yourself', () => {
    localStorage.setItem('lifeos:sidebar:collapsed', '1');
    render(<Sidebar areas={areas} />);
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: true } })); });
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: false } })); });
    expect(screen.queryByText('Business')).toBeNull();
  });
  it('a manual choice while the chat is open is respected when it closes', () => {
    render(<Sidebar areas={areas} />);
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: true } })); });
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:chat:state', { detail: { open: false } })); });
    expect(screen.getByText('Business')).toBeTruthy();
  });
  it('starts folded if the chat is already open when it mounts', () => {
    (window as unknown as { __lifeosChatOpen?: boolean }).__lifeosChatOpen = true;
    render(<Sidebar areas={areas} />);
    expect(screen.queryByText('Business')).toBeNull();
  });
});
