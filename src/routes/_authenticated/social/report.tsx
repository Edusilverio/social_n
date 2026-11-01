import { createFileRoute } from "@tanstack/react-router";
import { ConsolidatedReportPage } from "@/components/social/ConsolidatedReportPage";

export const Route = createFileRoute("/_authenticated/social/report")({
  component: ConsolidatedReportPage,
  head: () => ({ meta: [{ title: "Report Consolidado" }] }),
});
