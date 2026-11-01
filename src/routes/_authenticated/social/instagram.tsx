import { createFileRoute } from "@tanstack/react-router";
import { Instagram } from "lucide-react";
import { NetworkPage } from "@/components/social/NetworkPage";

export const Route = createFileRoute("/_authenticated/social/instagram")({
  component: () => (
    <NetworkPage
      network="instagram"
      title="Instagram"
      subtitle="Publicações e engajamento — tabela Instagram_ouro"
      icon={Instagram}
      accentColor="bg-instagram/10 text-instagram"
      titleLabel="Descrição"
      showPostType
    />
  ),
  head: () => ({ meta: [{ title: "Instagram — Social Dashboard" }] }),
});
