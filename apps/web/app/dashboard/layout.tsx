import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Sprout,
  Layers,
  ArrowLeftRight,
  KeyRound,
  Wallet,
  Award,
  ScrollText,
  LogOut,
} from 'lucide-react';

import { auth, signOut } from '../../auth';
import { getActorForUser } from '../../lib/actor';

import { MobileNav } from './mobile-nav';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: ScrollText },
  { href: '/dashboard/plots', label: 'Plots', icon: Sprout },
  { href: '/dashboard/batches', label: 'Batches', icon: Layers },
  { href: '/dashboard/handoffs', label: 'Handoffs', icon: ArrowLeftRight },
  { href: '/dashboard/api-keys', label: 'API keys', icon: KeyRound },
  { href: '/dashboard/wallet', label: 'Hedera wallet', icon: Wallet },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const roleLabel =
    (
      {
        cooperative: 'Cooperative',
        processor: 'Processor',
        exporter: 'Exporter',
        importer: 'Importer',
        auditor: 'Auditor',
        competent_authority: 'Competent authority',
        farmer: 'Farmer',
      } as Record<string, string>
    )[actor.role] ?? actor.role;

  return (
    <div className="flex min-h-screen bg-soil-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-soil-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-soil-200 px-6">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-leaf-600 text-white"
          >
            <Award className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-soil-900">
            Shamba Traceability
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-soil-700 transition-colors hover:bg-soil-100 hover:text-soil-900"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-soil-500" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-soil-200 p-4">
          <p className="truncate text-sm font-semibold text-soil-900">{actor.displayName}</p>
          <p className="text-xs text-soil-600">
            {roleLabel} · {actor.country}
            {actor.subnational ? ` · ${actor.subnational}` : ''}
          </p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
            className="mt-3"
          >
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-soil-300 bg-white px-3 py-1.5 text-xs font-medium text-soil-700 transition-colors hover:bg-soil-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <header className="flex h-16 items-center justify-between border-b border-soil-200 bg-white px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-md bg-leaf-600 text-white"
            >
              <Award className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-soil-900">Shamba</span>
          </div>
          <MobileNav
            actor={{
              displayName: actor.displayName,
              roleLabel,
              country: actor.country,
              subnational: actor.subnational,
            }}
          />
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
