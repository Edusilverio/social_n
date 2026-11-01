import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/_authenticated/seo")({
  component: () => <ComingSoon title="Módulo SEO" />,
});
