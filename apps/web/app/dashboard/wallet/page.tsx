import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';

import { WalletForm } from './wallet-form';

export const metadata = {
  title: 'Hedera wallet',
};

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Integrations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">Hedera wallet</h1>
        <p className="mt-3 text-sm text-soil-700">
          Link your Hedera account id so the platform can transfer batch NFTs into your custody when
          you accept a handoff. Without this, every accepted handoff settles in the off-chain ledger
          only; the HTS NFT stays under the previous custodian&rsquo;s account until you set this
          field.
        </p>
        <p className="mt-2 text-xs text-soil-600">
          Your account id is the <code>0.0.&lt;num&gt;</code> identifier from your Hedera wallet
          (HashPack, Blade, Kabila, ...). You can change or unlink it any time.
        </p>
      </header>

      <WalletForm actorId={actor.id} currentAccountId={actor.hederaAccountId ?? null} />

      <section className="mt-10 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-soil-900">Current actor record</h2>
        <dl className="mt-3 space-y-2 text-xs text-soil-700">
          <div>
            <dt className="font-medium text-soil-900">Actor id</dt>
            <dd className="break-all font-mono">{actor.id}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">DID</dt>
            <dd className="break-all font-mono">{actor.did}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">Hedera account id</dt>
            <dd className="break-all font-mono">{actor.hederaAccountId ?? '(not linked)'}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
