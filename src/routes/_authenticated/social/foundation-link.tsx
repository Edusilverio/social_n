import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/_authenticated/social/foundation-link")({
  component: () => <ComingSoon title="foundation-link" description="Esta página será liberada nas próximas iterações." />,
});
