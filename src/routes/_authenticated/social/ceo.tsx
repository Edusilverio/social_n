import { createFileRoute } from "@tanstack/react-router";
import { CeoViewPage } from "@/components/social/CeoViewPage";

export const Route = createFileRoute("/_authenticated/social/ceo")({
  component: CeoViewPage,
  head: () => ({ meta: [{ title: "CEO View" }] }),
});
