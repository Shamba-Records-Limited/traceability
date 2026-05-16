import { redirect } from 'next/navigation';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';

import { RegisterPlotForm } from './register-plot-form';

export const metadata = {
  title: 'Register a plot',
};

export default async function RegisterPlotPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Plots</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Register a plot
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          Provide the plot&rsquo;s WGS 84 geometry (a GeoJSON Polygon for plots over 4&nbsp;ha, or a
          Point for smaller plots). The deforestation check runs against the 31 December 2020
          cut-off.
        </p>
      </header>

      <RegisterPlotForm defaultCountry={actor.country} />
    </main>
  );
}
