import { createFileRoute } from "@tanstack/react-router";
import { KpisReportPage } from "@/components/social/KpisReportPage";

export const Route = createFileRoute("/_authenticated/social/kpis")({
  component: KpisReportPage,
  head: () => ({ meta: [{ title: "Report de KPIs" }] }),
});
