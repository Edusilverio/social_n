import { createFileRoute } from "@tanstack/react-router";
import { TwitterPage } from "@/components/social/TwitterPage";

export const Route = createFileRoute("/_authenticated/social/twitter")({
  component: TwitterPage,
  head: () => ({ meta: [{ title: "Twitter/X — Social Dashboard" }] }),
});
