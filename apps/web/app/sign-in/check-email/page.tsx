export const metadata = {
  title: 'Check your email',
};

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-soil-900">Check your email</h1>
      <p className="mt-3 text-sm text-soil-700">
        We&rsquo;ve sent you a single-use sign-in link. Open it from the same browser to continue.
      </p>
      <p className="mt-6 text-xs text-soil-600">
        Didn&rsquo;t receive anything? Check spam, or{' '}
        <a href="/sign-in" className="underline">
          request another link
        </a>
        .
      </p>
    </main>
  );
}
