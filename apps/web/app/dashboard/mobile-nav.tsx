'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeftRight,
  KeyRound,
  Layers,
  LogOut,
  Menu,
  ScrollText,
  Sprout,
  Wallet,
} from 'lucide-react';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../../components/ui/sheet';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: ScrollText },
  { href: '/dashboard/plots', label: 'Plots', icon: Sprout },
  { href: '/dashboard/batches', label: 'Batches', icon: Layers },
  { href: '/dashboard/handoffs', label: 'Handoffs', icon: ArrowLeftRight },
  { href: '/dashboard/api-keys', label: 'API keys', icon: KeyRound },
  { href: '/dashboard/wallet', label: 'Hedera wallet', icon: Wallet },
] as const;

export function MobileNav({
  actor,
}: {
  actor: { displayName: string; roleLabel: string; country: string; subnational: string | null };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-soil-300 bg-white text-soil-700"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetTitle>Menu</SheetTitle>
        <SheetDescription className="-mt-2 text-xs">Navigate the dashboard</SheetDescription>

        <nav className="-mx-2 flex-1 overflow-y-auto">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-soil-800 transition-colors hover:bg-soil-100"
                    >
                      <Icon className="h-4 w-4 text-soil-500" />
                      {item.label}
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-soil-200 pt-4">
          <p className="truncate text-sm font-semibold text-soil-900">{actor.displayName}</p>
          <p className="text-xs text-soil-600">
            {actor.roleLabel} · {actor.country}
            {actor.subnational ? ` · ${actor.subnational}` : ''}
          </p>
          <form action="/sign-out" method="post" className="mt-3" onSubmit={() => setOpen(false)}>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-soil-300 bg-white px-3 py-1.5 text-xs font-medium text-soil-700 transition-colors hover:bg-soil-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
