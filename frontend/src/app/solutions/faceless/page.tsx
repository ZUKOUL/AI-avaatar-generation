import { SolutionLanding } from "@/components/landing/solutions";

export const metadata = {
  title: "Horpen pour les chaînes faceless — 3 vidéos/jour sur 5 comptes | Horpen.ai",
  description:
    "Voix clonée indétectable, avatar IA, pipeline prompt → shorts publiés automatiquement. Gère 5 chaînes faceless en parallèle sans jamais rallumer une caméra.",
};

export default function FacelessSolution() {
  return <SolutionLanding slug="faceless" />;
}
