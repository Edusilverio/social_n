import { createFileRoute } from "@tanstack/react-router";
import { Facebook } from "lucide-react";
import { NetworkPage } from "@/components/social/NetworkPage";

export const Route = createFileRoute("/_authenticated/social/facebook")({
  component: () => (
    <NetworkPage
      network="facebook"
      title="Facebook"
      subtitle="Publicações e engajamento — tabela Facebook_ouro"
      icon={Facebook}
      accentColor="bg-facebook/10 text-facebook"
      titleLabel="Título"
      showPostType
    />
  ),
  head: () => ({ meta: [{ title: "Facebook — Social Dashboard" }] }),
});
