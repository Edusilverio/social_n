import { createFileRoute } from "@tanstack/react-router";
import { YoutubePage } from "@/components/social/YoutubePage";

export const Route = createFileRoute("/_authenticated/social/youtube")({
  component: YoutubePage,
  head: () => ({ meta: [{ title: "YouTube — Social Dashboard" }] }),
});
