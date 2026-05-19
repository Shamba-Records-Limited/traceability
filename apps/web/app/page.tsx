import Link from 'next/link';
import {
  ArrowRight,
  Award,
  ExternalLink,
  Globe2,
  Layers,
  Leaf,
  Lock,
  ScanLine,
  ShieldCheck,
  Sprout,
} from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

const PILLARS = [
  {
    icon: Sprout,
    title: 'Plot to shelf, on-chain',
    body: 'Register plots in PostGIS with WGS 84 polygons, run a real Global Forest Watch deforestation check against the 31 December 2020 EUDR cut-off, and commit every event to Hedera Consensus Service.',
  },
  {
    icon: Layers,
    title: 'Batch NFTs + lineage',
    body: 'Aggregate plots into traceable batches. Each batch lands on-chain as an HTS NFT with a Hedera EVM smart-contract record. Splits, merges, and handoffs all carry tamper-evident commitments.',
  },
  {
    icon: ShieldCheck,
    title: 'EUDR Article 9 ready',
    body: 'Operators issue Due Diligence Statements with deterministic JSON + SHA-256 content hashes committed to HCS. Auditors verify against the public ledger; competent authorities get token-gated read-only shares.',
  },
] as const;

const STATS = [
  { label: 'On-chain anchors', value: 'HCS · HTS · EVM' },
  { label: 'Article 9(1)', value: '(a)-(h) covered' },
  { label: 'License', value: 'AGPL-3.0' },
  { label: 'Status', value: 'v0.1.0' },
];

export default function HomePage() {
  return (
    <div className="bg-soil-50 text-soil-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-600 text-white"
          >
            <Award className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">Shamba Traceability</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-soil-700">
          <Link href="/dashboard" className="hidden sm:inline hover:text-soil-900">
            Dashboard
          </Link>
          <a
            href="https://github.com/Shamba-Records-Limited/traceability"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 hover:text-soil-900"
          >
            <ExternalLink className="h-4 w-4" /> GitHub
          </a>
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-leaf-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Sign in
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[3fr_2fr] lg:items-center lg:py-20">
          <div>
            <Badge tone="success" className="mb-5">
              <Leaf className="h-3.5 w-3.5" />
              Open source · Hedera-native · EUDR-aligned
            </Badge>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-soil-900 sm:text-5xl lg:text-6xl">
              Provenance you can prove,
              <br />
              for every commodity.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-soil-700">
              Shamba Traceability is the open-source backbone for agricultural supply-chain
              provenance. Register plots, tokenize lots, record every handoff on Hedera, and
              generate Due Diligence Statements that auditors can verify without trusting the
              platform.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
              >
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/Shamba-Records-Limited/traceability"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-soil-300 bg-white px-6 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
              >
                <ExternalLink className="h-4 w-4" />
                Read the source
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs uppercase tracking-wide text-soil-500">{s.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-soil-900">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative hidden lg:block">
            <div className="rounded-lg border border-leaf-200 bg-leaf-50/80 p-8 shadow-sm">
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-start gap-3 rounded-md bg-white p-4 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
                    <Globe2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-soil-900">Plot attested</p>
                    <p className="mt-0.5 font-mono text-[11px] text-soil-600">
                      0.0.4587102 · seq 1
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-white p-4 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-soil-900">Batch minted</p>
                    <p className="mt-0.5 font-mono text-[11px] text-soil-600">0.0.4587103 #1</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-white p-4 shadow-sm">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
                    <ScanLine className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-soil-900">DDS issued</p>
                    <p className="mt-0.5 font-mono text-[11px] text-soil-600">
                      SHAMBA-DDS-A1B2C3D4
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="flex flex-col">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="mt-3">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-soil-700">{p.body}</CardContent>
              </Card>
            );
          })}
        </section>

        {/* Who it's for */}
        <section className="grid grid-cols-1 gap-8 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-soil-900 sm:text-3xl">
              Built for the chain of custody, end to end.
            </h2>
            <p className="mt-4 text-soil-700">
              Cooperatives and exporters fill in their plots and certifications. Importers and
              competent authorities consume tamper-evident bundles. Consumers scan a QR on the bag
              and see the journey, anchored on a public ledger.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Who it&rsquo;s for</CardTitle>
              <CardDescription>
                One open-source codebase, every actor on the supply chain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-soil-800">
                <li className="flex items-start gap-2">
                  <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                  <span>
                    <strong>Cooperatives</strong> register farmers, capture plot polygons, and run
                    deforestation checks at intake.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Layers className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                  <span>
                    <strong>Processors</strong> reconcile intake, track splits/merges, preserve
                    lineage across batches.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                  <span>
                    <strong>Exporters</strong> prepare EUDR Due Diligence Statements with on-chain
                    content-hash commits.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                  <span>
                    <strong>Importers + competent authorities</strong> get token-gated read-only
                    audit URLs.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                  <span>
                    <strong>Consumers</strong> scan a QR on packaging and see the full traceability
                    story.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-soil-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-soil-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            A project of{' '}
            <a href="https://shambarecords.com" className="underline">
              Shamba Records Limited
            </a>
            . Dual-licensed under AGPL-3.0 + commercial license.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Shamba-Records-Limited/traceability"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-soil-900"
            >
              <ExternalLink className="h-4 w-4" /> Source on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
