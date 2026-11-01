import { createFileRoute } from "@tanstack/react-router";
import { SyncDrivePage } from "@/components/social/SyncDrivePage";

export const Route = createFileRoute("/_authenticated/social/sincronizar")({
  component: SyncDrivePage,
  head: () => ({ meta: [{ title: "Sincronizar dados — Social" }] }),
});
