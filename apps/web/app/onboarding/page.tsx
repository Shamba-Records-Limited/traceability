import { redirect } from 'next/navigation';

import { auth } from '../../auth';
import { getActorForUser } from '../../lib/actor';

import { OnboardingForm } from './onboarding-form';

export const metadata = {
  title: 'Get started',
};

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in');
  }

  // If onboarding has already happened, drop the user straight on the dashboard.
  const existing = await getActorForUser(session.user.id);
  if (existing) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Welcome</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Tell us who you are
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          We need a role and country to set up your actor profile. You can update this later.
        </p>
      </header>

      <OnboardingForm defaultEmail={session.user.email ?? ''} />
    </main>
  );
}
