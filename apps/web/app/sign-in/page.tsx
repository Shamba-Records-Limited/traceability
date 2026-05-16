import { signIn } from '../../auth';

export const metadata = {
  title: 'Sign in',
};

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-soil-900">Sign in to Shamba</h1>
      <p className="mt-2 text-sm text-soil-700">
        Enter your email and we&rsquo;ll send you a single-use sign-in link.
      </p>

      <form
        action={async (formData) => {
          'use server';
          await signIn('nodemailer', formData);
        }}
        className="mt-8 space-y-4"
      >
        <label className="block">
          <span className="text-sm font-medium text-soil-800">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
        >
          Send magic link
        </button>
      </form>

      <p className="mt-6 text-xs text-soil-600">
        By continuing you agree to the{' '}
        <a href="/legal/terms" className="underline">
          terms of service
        </a>
        .
      </p>
    </main>
  );
}
