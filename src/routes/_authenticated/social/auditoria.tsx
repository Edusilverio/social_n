import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/_authenticated/social/auditoria")({
  component: () => <ComingSoon title="auditoria" description="Esta página será liberada nas próximas iterações." />,
});
