import { redirect } from 'next/navigation';

import { auth, signOut } from '../../auth';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const session = await auth();
  // Belt and braces: middleware also enforces this, but a server-rendered
  // page should never trust the middleware exclusively.
  if (!session?.user) {
    redirect('/sign-in');
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
            Welcome, {session.user.email}
          </h1>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-soil-300 bg-white px-4 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10 space-y-3 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Onboarding pending</h2>
        <p className="text-sm text-soil-700">
          You&rsquo;re signed in, but you don&rsquo;t have an actor profile yet. The onboarding flow
          that captures your role (cooperative, processor, exporter, auditor) and country will land
          in a follow-up PR. After that, your{' '}
          <code className="rounded bg-soil-100 px-1 py-0.5 text-xs">did:hedera</code> identifier
          gets minted automatically.
        </p>
      </section>
    </main>
  );
}
