import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/_authenticated/social/foundation-face")({
  component: () => <ComingSoon title="foundation-face" description="Esta página será liberada nas próximas iterações." />,
});
