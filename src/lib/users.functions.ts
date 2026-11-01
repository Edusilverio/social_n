import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc, getDataClient } from "@/lib/social-data.server";

// ============================================================
// Gestão de usuários — modelo BI Acme adaptado ao Aurora Tech.
// Auth admin ops via client service-role. E-mail via Resend.
// Senha temporária + troca obrigatória (must_change_password).
// Acesso é só por PAPEL (viewer/editor/admin/root) — sem escopo por página.
// ============================================================

const ROLES = ["viewer", "editor", "admin", "root"] as const;
export type UserRole = (typeof ROLES)[number];

export type ManagedUser = {
  id: string;
  email: string;
  nome: string | null;
  role: UserRole;
  ativo: boolean;
  criadoEm: string | null;
  ultimoLogin: string | null;
  convitePendente: boolean;
};

const FROM = "Aurora Tech Dashboard <noreply@exemplo.com.br>";

function appUrl(fallbackOrigin?: string): string {
  return (process.env.APP_URL ?? fallbackOrigin ?? "").replace(/\/+$/, "");
}

function sessionEmail(context: { claims?: unknown }): string {
  const email = (context.claims as { email?: string } | undefined)?.email;
  if (!email || typeof email !== "string") {
    throw new Error("Sessão sem e-mail válido — refaça login.");
  }
  return email.trim().toLowerCase();
}

async function assertCanManage(callerEmail: string): Promise<void> {
  const raw = await callRpc<{ canManageUsers?: boolean } | null>("rpc_user_role", {
    p_email: callerEmail,
  });
  if (!raw?.canManageUsers) {
    throw new Error("Você não tem permissão para gerir usuários.");
  }
}

type AdminInfo = { uid: string | null; role: string | null; rootsAtivos: number };
async function adminInfo(email: string): Promise<AdminInfo> {
  const raw = await callRpc<AdminInfo | null>("rpc_user_admin_info", { p_email: email });
  return { uid: raw?.uid ?? null, role: raw?.role ?? null, rootsAtivos: raw?.rootsAtivos ?? 0 };
}

// Senha temporária forte (satisfaz a política: >=8, maiúscula, minúscula, número).
function genTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const all = upper + lower + digit;
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const pick = (s: string) => s[rnd(s.length)];
  const chars = [pick(upper), pick(lower), pick(digit)];
  for (let i = 0; i < 9; i++) chars.push(pick(all));
  // embaralho de Fisher-Yates (sem viés)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Envio de e-mail via Resend (mesmo padrão do BI Acme). Falha silenciosa sem a chave.
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function emailBoasVindas(nome: string, email: string, senha: string, url: string): string {
  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#111">
    <h2>Bem-vindo(a) ao Aurora Tech Dashboard</h2>
    <p>Olá, ${nome}. Sua conta foi criada. Use as credenciais abaixo para o primeiro acesso:</p>
    <p style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:14px">
      <strong>Login:</strong> ${email}<br>
      <strong>Senha temporária:</strong> <code>${senha}</code>
    </p>
    <p><strong>Por segurança, você será solicitado a trocar a senha no primeiro acesso.</strong></p>
    ${url ? `<p><a href="${url}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Acessar o dashboard</a></p>` : ""}
    <p style="color:#71717a;font-size:12px">Se você não esperava este e-mail, ignore-o.</p>
  </div>`;
}

function emailReset(nome: string, email: string, senha: string, url: string): string {
  return `
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#111">
    <h2>Sua senha foi redefinida</h2>
    <p>Olá, ${nome}. Um administrador redefiniu sua senha de acesso.</p>
    <p style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:14px">
      <strong>Login:</strong> ${email}<br>
      <strong>Nova senha temporária:</strong> <code>${senha}</code>
    </p>
    <p><strong>Você será solicitado a trocar a senha no próximo acesso.</strong></p>
    ${url ? `<p><a href="${url}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Acessar o dashboard</a></p>` : ""}
  </div>`;
}

// ------------------------------------------------------------
// Listar
// ------------------------------------------------------------
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    const caller = sessionEmail(context);
    await assertCanManage(caller);
    const rows = await callRpc<ManagedUser[] | null>("rpc_list_users", { p_caller_email: caller });
    return rows ?? [];
  });

// ------------------------------------------------------------
// Criar (senha temporária + e-mail de boas-vindas via Resend)
// ------------------------------------------------------------
const CreateSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1, "Informe o nome"),
  role: z.enum(ROLES),
  appOrigin: z.string().url().optional(),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; emailEnviado: boolean; senhaTemporaria: string | null; jaExistia: boolean }> => {
      const caller = sessionEmail(context);
      await assertCanManage(caller);
      const sb = getDataClient();
      const email = data.email.trim().toLowerCase();
      const url = appUrl(data.appOrigin);

      const senha = genTempPassword();
      const cr = await sb.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome: data.nome, must_change_password: true },
      });

      let jaExistia = false;
      if (cr.error) {
        if (/already|registered|exist/i.test(cr.error.message)) {
          jaExistia = true;
        } else {
          throw new Error(`Falha ao criar login: ${cr.error.message}`);
        }
      }

      if (jaExistia) {
        // Não sobrescreve o papel de um usuário que já existe (evita rebaixar
        // acidentalmente, inclusive um root). Só cria a linha se ainda não houver.
        const ins = await sb
          .from("user_roles")
          .upsert(
            { email, nome: data.nome, role: data.role, ativo: true, criado_por: caller },
            { onConflict: "email", ignoreDuplicates: true },
          );
        if (ins.error) throw new Error(`Falha ao gravar papel: ${ins.error.message}`);
        return { ok: true, emailEnviado: false, senhaTemporaria: null, jaExistia: true };
      }

      const up = await sb
        .from("user_roles")
        .upsert(
          { email, nome: data.nome, role: data.role, ativo: true, criado_por: caller },
          { onConflict: "email" },
        );
      if (up.error) throw new Error(`Falha ao gravar papel: ${up.error.message}`);

      const emailEnviado = await sendEmail(
        email,
        "Seu acesso ao Aurora Tech Dashboard",
        emailBoasVindas(data.nome, email, senha, url),
      );
      return { ok: true, emailEnviado, senhaTemporaria: senha, jaExistia: false };
    },
  );

// ------------------------------------------------------------
// Editar (nome + papel)
// ------------------------------------------------------------
const UpdateSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1),
  role: z.enum(ROLES),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = sessionEmail(context);
    await assertCanManage(caller);
    const email = data.email.trim().toLowerCase();

    const info = await adminInfo(email);
    if (info.role === "root" && data.role !== "root" && info.rootsAtivos <= 1) {
      throw new Error("Não é possível rebaixar o último root.");
    }

    const sb = getDataClient();
    const up = await sb
      .from("user_roles")
      .upsert({ email, nome: data.nome, role: data.role, ativo: true }, { onConflict: "email" });
    if (up.error) throw new Error(`Falha ao atualizar: ${up.error.message}`);
    return { ok: true };
  });

// ------------------------------------------------------------
// Resetar senha (senha temporária + e-mail; fallback: link de recuperação)
// ------------------------------------------------------------
const ResetSchema = z.object({
  email: z.string().email(),
  appOrigin: z.string().url().optional(),
});

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResetSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; emailEnviado: boolean; senhaTemporaria: string | null; linkRecuperacao: string | null }> => {
      const caller = sessionEmail(context);
      await assertCanManage(caller);
      const email = data.email.trim().toLowerCase();
      const url = appUrl(data.appOrigin);

      const info = await adminInfo(email);
      if (!info.uid) throw new Error("Usuário não encontrado.");

      const sb = getDataClient();
      const senha = genTempPassword();
      const upd = await sb.auth.admin.updateUserById(info.uid, {
        password: senha,
        user_metadata: { must_change_password: true },
      });

      if (!upd.error) {
        const emailEnviado = await sendEmail(
          email,
          "Sua senha do Aurora Tech Dashboard foi redefinida",
          emailReset(email, email, senha, url),
        );
        return { ok: true, emailEnviado, senhaTemporaria: senha, linkRecuperacao: null };
      }

      // Fallback: link de recuperação
      const { data: gen, error } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: url ? { redirectTo: `${url}/reset-password` } : undefined,
      });
      if (error) throw new Error(`Falha ao redefinir senha: ${error.message}`);
      const link =
        (gen as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? null;
      const emailEnviado = link
        ? await sendEmail(
            email,
            "Redefina sua senha — Aurora Tech Dashboard",
            `<p>Um administrador solicitou a redefinição da sua senha.</p><p><a href="${link}">Clique aqui para definir uma nova senha</a> (o link expira em ~24h).</p>`,
          )
        : false;
      return { ok: true, emailEnviado, senhaTemporaria: null, linkRecuperacao: link };
    },
  );

// ------------------------------------------------------------
// Excluir (login + cadastro)
// ------------------------------------------------------------
const DeleteSchema = z.object({ email: z.string().email() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = sessionEmail(context);
    await assertCanManage(caller);
    const email = data.email.trim().toLowerCase();

    if (email === caller) throw new Error("Você não pode excluir a si mesmo.");
    const info = await adminInfo(email);
    if (!info.uid) throw new Error("Usuário não encontrado.");
    if (info.role === "root" && info.rootsAtivos <= 1) {
      throw new Error("Não é possível excluir o último root.");
    }

    const sb = getDataClient();
    const del = await sb.auth.admin.deleteUser(info.uid);
    if (del.error) throw new Error(`Falha ao excluir login: ${del.error.message}`);
    const delRole = await sb.from("user_roles").delete().eq("email", email);
    if (delRole.error)
      throw new Error(`Login excluído, mas falhou ao remover o papel: ${delRole.error.message}`);
    return { ok: true };
  });
