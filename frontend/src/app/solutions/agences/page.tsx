import { SolutionLanding, SOLUTIONS } from "@/components/landing/solutions";

export const metadata = {
  title: "Horpen pour les agences créa — 10× de livrables par client | Horpen.ai",
  description:
    "Un workspace par client, avatars IA dédiés, batch de 100 ads par junior. Les agences marketing, UGC et ad-buying servent 20 clients en parallèle avec la même équipe. Marge multipliée.",
};

export default function AgencesSolution() {
  return <SolutionLanding config={SOLUTIONS.agences} />;
}
