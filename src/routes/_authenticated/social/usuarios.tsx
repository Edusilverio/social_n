import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "@/components/social/UsersPage";

export const Route = createFileRoute("/_authenticated/social/usuarios")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "Gestão de usuários" }] }),
});
