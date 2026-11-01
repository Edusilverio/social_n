import { createFileRoute } from "@tanstack/react-router";
import { Linkedin } from "lucide-react";
import { NetworkPage } from "@/components/social/NetworkPage";
import { NULL_HASHTAG } from "@/components/social/SocialFilters";

// Hashtags institucionais que devem aparecer DESMARCADAS por padrão.
const LINKEDIN_DEFAULT_EXCLUDED = [
  "#AuroraTechAustria",
  "#AuroraTechCroatia",
  "#AuroraTechCzechRepublic",
  "#AuroraTechEC",
  "#AuroraTechGermany",
  "#AuroraTechGlobal",
  "#AuroraTechRomania",
  "#AuroraTechSwitzerland",
  "#AuroraTechUK",
  NULL_HASHTAG,
];

export const Route = createFileRoute("/_authenticated/social/linkedin")({
  component: () => (
    <NetworkPage
      network="linkedin"
      title="LinkedIn"
      subtitle="Publicações e engajamento — tabela Linkedin_ouro"
      icon={Linkedin}
      accentColor="bg-linkedin/10 text-linkedin"
      titleLabel="Título da publicação"
      defaultExcludedHashtags={LINKEDIN_DEFAULT_EXCLUDED}
    />
  ),
  head: () => ({ meta: [{ title: "LinkedIn — Social Dashboard" }] }),
});
