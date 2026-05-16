import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-6 py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-leaf-500" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Shamba Traceability</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-soil-700">
          <Link href="/dashboard" className="hover:text-soil-900">
            Dashboard
          </Link>
          <Link href="/docs" className="hover:text-soil-900">
            Docs
          </Link>
          <a
            href="https://github.com/Shamba-Records-Limited/traceability"
            className="hover:text-soil-900"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">
          Open source · Hedera-native · EUDR-aligned
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-soil-900 sm:text-5xl">
          Provenance you can prove,
          <br />
          for every commodity.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-soil-700">
          Shamba Traceability is the open-source layer for agricultural supply-chain provenance.
          Register plots, tokenize lots, record every handoff on Hedera, and generate compliant EU
          Deforestation Regulation due-diligence statements — from cooperative to importer.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Open dashboard
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-11 items-center rounded-md border border-soil-300 bg-white px-6 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
          >
            Read the docs
          </Link>
        </div>
      </section>

      <footer className="border-t border-soil-200 pt-6 text-xs text-soil-600">
        <p>
          A project of{' '}
          <a href="https://shambarecords.com" className="underline">
            Shamba Records Limited
          </a>
          . Source code dual-licensed under AGPL-3.0 and a commercial licence.
        </p>
      </footer>
    </main>
  );
}
