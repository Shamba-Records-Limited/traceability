import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Award,
  Fingerprint,
  KeyRound,
  Layers,
  Sprout,
  Wallet,
} from 'lucide-react';

import { auth } from '../../auth';
import { getActorForUser, isPlaceholderDid } from '../../lib/actor';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export const metadata = {
  title: 'Dashboard',
};

const SECTIONS = [
  {
    href: '/dashboard/plots',
    icon: Sprout,
    title: 'Plots',
    blurb:
      'Register the land you produce on. WGS 84 polygons or points. Each registration runs the EUDR deforestation check against the 31 December 2020 cut-off.',
    cta: 'Manage plots',
  },
  {
    href: '/dashboard/batches',
    icon: Layers,
    title: 'Batches',
    blurb:
      'Aggregate produce from your plots into traceable batches. Each batch lands on-chain as an HTS NFT with a Hedera Consensus Service event stream and Solidity registry record.',
    cta: 'Manage batches',
  },
  {
    href: '/dashboard/handoffs',
    icon: ArrowLeftRight,
    title: 'Handoffs',
    blurb:
      'Hand off batch custody between actors. When both sides have linked a Hedera account, the HTS NFT transfers on-chain at acceptance.',
    cta: 'Manage handoffs',
  },
  {
    href: '/dashboard/wallet',
    icon: Wallet,
    title: 'Hedera wallet',
    blurb:
      'Link your Hedera account id so on-chain NFT transfers can land in your custody at handoff acceptance.',
    cta: 'Manage wallet',
  },
  {
    href: '/dashboard/api-keys',
    icon: KeyRound,
    title: 'API keys',
    blurb:
      'Mint API keys for external systems (ERPs, importer dashboards, certifiers) to read your plots, batches, events, and lineage via the public REST API.',
    cta: 'Manage API keys',
  },
] as const;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const placeholderDid = isPlaceholderDid(actor.did);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-leaf-600">
            Welcome back
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900 sm:text-4xl">
            {actor.displayName}
          </h1>
          <p className="mt-1 text-sm text-soil-700">
            Open-source EUDR-aligned traceability, anchored on Hedera.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actor.hederaAccountId ? (
            <Badge tone="success">
              <Wallet className="h-3.5 w-3.5" />
              Wallet linked
            </Badge>
          ) : (
            <Badge tone="warning">
              <Wallet className="h-3.5 w-3.5" />
              Wallet not linked
            </Badge>
          )}
          {placeholderDid ? (
            <Badge tone="warning">
              <Fingerprint className="h-3.5 w-3.5" />
              DID pending
            </Badge>
          ) : (
            <Badge tone="success">
              <Fingerprint className="h-3.5 w-3.5" />
              DID minted
            </Badge>
          )}
        </div>
      </header>

      {placeholderDid ? (
        <Alert tone="warning" className="mt-8">
          <AlertTriangle />
          <AlertTitle>Your audit-trail identifier is still being minted</AlertTitle>
          <AlertDescription>
            The platform is rotating your placeholder DID to a real{' '}
            <code className="font-mono">did:hedera:...</code> on Hedera. This usually completes
            within a few minutes; the reconciler retries automatically. Existing flows work in the
            meantime.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
              <Award className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle>Decentralised identifier</CardTitle>
              <CardDescription>
                Your audit-trail identity. Hashes of events you emit are committed against this DID.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="break-all rounded-md bg-soil-50 px-3 py-2 font-mono text-xs text-soil-700">
              {actor.did}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.href} className="flex flex-col">
              <CardHeader className="flex-row items-center gap-3 pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-sm text-soil-700">{section.blurb}</p>
                <Link
                  href={section.href}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 self-start rounded-md bg-leaf-600 px-3 text-xs font-medium text-white transition-colors hover:bg-leaf-700"
                >
                  {section.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
