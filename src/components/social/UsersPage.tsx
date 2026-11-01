import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserPlus, Pencil, Trash2, KeyRound, ShieldAlert, Copy } from "lucide-react";
import { getUserRole } from "@/lib/social.functions";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  type ManagedUser,
  type UserRole,
} from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROLE_LABEL: Record<UserRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
  root: "Root",
};
const ROLE_OPTIONS: UserRole[] = ["viewer", "editor", "admin", "root"];

function roleBadgeVariant(role: UserRole): "default" | "secondary" | "outline" {
  if (role === "root") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

type Credentials = { email: string; senha: string | null; link: string | null; emailEnviado: boolean };

export function UsersPage() {
  const getUserRoleFn = useServerFn(getUserRole);
  const roleQuery = useQuery({
    queryKey: ["user-role"],
    queryFn: () => getUserRoleFn({ data: undefined }),
    staleTime: 5 * 60_000,
  });
  const canManage = roleQuery.data?.canManageUsers === true;
  const myEmail = (roleQuery.data?.email ?? "").toLowerCase();

  if (roleQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A gestão de usuários é exclusiva de administradores (root/admin).
        </p>
      </div>
    );
  }

  return <UsersManager myEmail={myEmail} />;
}

function UsersManager({ myEmail }: { myEmail: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const updateFn = useServerFn(updateUser);
  const deleteFn = useServerFn(deleteUser);
  const resetFn = useServerFn(resetPassword);

  const usersQuery = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => listFn({ data: undefined }),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null);
  const [toReset, setToReset] = useState<ManagedUser | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["managed-users"] });

  const createMut = useMutation({
    mutationFn: (input: { email: string; nome: string; role: UserRole; appOrigin: string }) =>
      createFn({ data: input }),
    onSuccess: (res, vars) => {
      setFormOpen(false);
      invalidate();
      if (res.jaExistia) {
        toast.message("Usuário já existia — papel atualizado.", {
          description: "Use 'Resetar senha' para gerar um novo acesso.",
        });
        return;
      }
      if (res.emailEnviado) {
        toast.success("Usuário criado — e-mail de acesso enviado.");
      } else {
        toast.message("Usuário criado", {
          description: "E-mail não configurado. Copie a senha temporária para enviar.",
        });
      }
      setCreds({
        email: vars.email,
        senha: res.senhaTemporaria,
        link: null,
        emailEnviado: res.emailEnviado,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: { email: string; nome: string; role: UserRole }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      setFormOpen(false);
      invalidate();
      toast.success("Usuário atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (email: string) => deleteFn({ data: { email } }),
    onSuccess: () => {
      setToDelete(null);
      invalidate();
      toast.success("Usuário excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (email: string) => resetFn({ data: { email, appOrigin: appOrigin() } }),
    onSuccess: (res, email) => {
      setToReset(null);
      if (res.emailEnviado) {
        toast.success("Senha redefinida — e-mail enviado.");
      } else {
        toast.message("Senha redefinida", {
          description: "E-mail não configurado. Copie a senha/link para enviar.",
        });
      }
      setCreds({
        email,
        senha: res.senhaTemporaria,
        link: res.linkRecuperacao,
        emailEnviado: res.emailEnviado,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setNome("");
    setEmail("");
    setRole("viewer");
    setFormOpen(true);
  };
  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setNome(u.nome ?? "");
    setEmail(u.email);
    setRole(u.role);
    setFormOpen(true);
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMut.mutate({ email: editing.email, nome, role });
    } else {
      createMut.mutate({ email, nome, role, appOrigin: appOrigin() });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado.");
    } catch {
      toast.message("Copie manualmente", { description: text });
    }
  };

  const users = usersQuery.data ?? [];
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Administração</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão de usuários</h1>
          <p className="mt-2 text-muted-foreground">
            Crie, edite e exclua usuários e seus papéis de acesso.
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="mr-2 h-4 w-4" /> Novo usuário
        </Button>
      </header>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Carregando usuários…
                </TableCell>
              </TableRow>
            )}
            {!usersQuery.isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => {
              const isSelf = u.email.toLowerCase() === myEmail;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(u.role)}>{ROLE_LABEL[u.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.convitePendente ? (
                      <span className="text-xs text-amber-600">Nunca acessou</span>
                    ) : (
                      <span className="text-xs text-emerald-600">Ativo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(u.ultimoLogin)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Resetar senha"
                        onClick={() => setToReset(u)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={isSelf ? "Você não pode excluir a si mesmo" : "Excluir"}
                        onClick={() => setToDelete(u)}
                        disabled={isSelf}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Criar / Editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <form onSubmit={submitForm}>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Atualize o nome e o papel de acesso."
                  : "O usuário recebe um e-mail com uma senha temporária e troca a senha no primeiro acesso."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="u-nome">Nome</Label>
                <Input
                  id="u-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-email">E-mail</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vitor.souza@exemplo.com.br"
                  required
                  disabled={!!editing}
                />
                {editing && (
                  <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Viewer: só leitura · Editor/Admin: escreve dados · Admin/Root: também gerem usuários.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Salvar" : "Criar e enviar acesso"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credenciais (senha temporária / link) — fallback quando o e-mail não sai */}
      <Dialog open={!!creds} onOpenChange={(o) => !o && setCreds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso gerado</DialogTitle>
            <DialogDescription>
              {creds?.emailEnviado
                ? "Um e-mail com as instruções foi enviado. Você também pode compartilhar manualmente abaixo."
                : "Compartilhe estas credenciais com o usuário (o e-mail automático não está configurado)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 font-mono">{creds?.email}</div>
            </div>
            {creds?.senha && (
              <div>
                <Label className="text-xs text-muted-foreground">Senha temporária</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono">{creds.senha}</div>
                  <Button variant="outline" size="icon" onClick={() => copy(creds.senha!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {creds?.link && (
              <div>
                <Label className="text-xs text-muted-foreground">Link de redefinição</Label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                    {creds.link}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copy(creds.link!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreds(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resetar senha */}
      <AlertDialog open={!!toReset} onOpenChange={(o) => !o && setToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
            <AlertDialogDescription>
              Gera uma nova senha temporária para <strong>{toReset?.email}</strong> e envia por e-mail
              (se configurado). No próximo acesso, o usuário terá que definir uma nova senha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toReset) resetMut.mutate(toReset.email);
              }}
              disabled={resetMut.isPending}
            >
              {resetMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resetar senha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o login e o cadastro de <strong>{toDelete?.email}</strong> de forma
              definitiva. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMut.mutate(toDelete.email);
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
