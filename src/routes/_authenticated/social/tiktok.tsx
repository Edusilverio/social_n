import { createFileRoute } from "@tanstack/react-router";
import { TiktokPage } from "@/components/social/TiktokPage";

export const Route = createFileRoute("/_authenticated/social/tiktok")({
  component: TiktokPage,
  head: () => ({ meta: [{ title: "TikTok — Social Dashboard" }] }),
});
