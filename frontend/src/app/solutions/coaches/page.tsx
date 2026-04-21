import { SolutionLanding, SOLUTIONS } from "@/components/landing/solutions";

export const metadata = {
  title: "Horpen pour les coaches & infopreneurs — Recycle ton expertise | Horpen.ai",
  description:
    "Transforme ton podcast, tes formations et tes lives en 400+ shorts vidéo par mois. Ton avatar IA poste à ta place, ton audience grossit pendant que tu coaches.",
};

export default function CoachesSolution() {
  return <SolutionLanding config={SOLUTIONS.coaches} />;
}
