import { useMemo, useState } from "react";
import { ArrowUpDown, Download, ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDatePtBR } from "@/lib/format-date";

export type PostExtras = Record<string, string | number | boolean | null | undefined>;

interface Post {
  titulo: string | null;
  link: string | null;
  data: string | null;
  impressions: number;
  reach: number;
  interactions: number;
  engRate?: number | null;
  hashtag?: string | null;
  postType?: string | null;
  postId?: string | null;
  rede?: string | null;
  visualizacoes?: number | null;
  extras?: PostExtras;
}

interface Props {
  posts: Post[];
  titleLabel?: string;
  hasPostType?: boolean;
  hasPostId?: boolean;
  hasExtras?: boolean;
  hasRede?: boolean;
  exportFileName?: string;
}

// União de todas as colunas específicas por rede (Facebook, Instagram, Instagram Story,
// LinkedIn, TikTok, Twitter, YouTube). PostsTable esconde automaticamente as que não
// aparecem em nenhum post da lista, então cada rede acaba mostrando só o subconjunto
// que realmente vem preenchido no jsonb `extras`.
const EXTRA_COLS: { key: string; label: string }[] = [
  { key: "visualizacoes", label: "Visualizações" },
  // Reações / curtidas / gostos
  { key: "reacoes", label: "Reações" },
  { key: "curtidas", label: "Curtidas" },
  { key: "gostos", label: "Gostos" },
  { key: "gostaram", label: "Gostaram" },
  { key: "gostei", label: "Gostei" },
  { key: "favoritos", label: "Favoritos" },
  // Comentários / respostas
  { key: "comentarios", label: "Comentários" },
  { key: "respostas", label: "Respostas" },
  // Compartilhar / partilhas / reposts
  { key: "partilhas", label: "Partilhas" },
  { key: "compartilhamentos", label: "Compartilhamentos" },
  { key: "compartilhar", label: "Compartilhar" },
  { key: "reposts", label: "Reposts" },
  // Cliques
  { key: "cliques", label: "Cliques" },
  { key: "totalCliques", label: "Total de cliques" },
  { key: "cliquesLink", label: "Cliques no Link" },
  { key: "outrosCliques", label: "Outros cliques" },
  { key: "cliquesNaUrl", label: "Cliques na URL" },
  // Interações extras
  { key: "engajamentos", label: "Engajamentos" },
  { key: "itensGuardados", label: "Itens guardados" },
  { key: "itensSalvos", label: "Itens salvos" },
  { key: "toquesEmStickers", label: "Toques em stickers" },
  { key: "navegacao", label: "Navegação" },
  { key: "visitasAoPerfil", label: "Visitas ao perfil" },
  // Seguidores
  { key: "seguimentos", label: "Seguimentos" },
  { key: "seguidores", label: "Seguidores" },
  { key: "novosSeguidores", label: "Novos seguidores" },
  { key: "inscritos", label: "Inscritos" },
  { key: "inscricoesObtidas", label: "Inscrições obtidas" },
  { key: "inscricoesPerdidas", label: "Inscrições perdidas" },
  // Metadados (texto)
  { key: "duracao", label: "Duração" },
  { key: "nomeConta", label: "Nome da Conta" },
  { key: "publicadaPor", label: "Publicada por" },
  { key: "tipoPublicacao", label: "Tipo de publicação" },
];

const PAGE_SIZE = 25;

function formatNum(n: number) {
  return n.toLocaleString("pt-BR");
}
function formatDate(d: string | null) {
  return formatDatePtBR(d) || "—";
}

export function PostsTable({ posts, titleLabel = "Título", hasPostType, hasPostId, hasExtras, hasRede, exportFileName = "posts" }: Props) {
  const [sortKey, setSortKey] = useState<keyof Post>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    return [...posts].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [posts, sortKey, sortDir]);

  // Colunas extras só aparecem se ao menos um post tiver valor não-nulo.
  const visibleExtras = useMemo(() => {
    if (!hasExtras) return [] as typeof EXTRA_COLS;
    return EXTRA_COLS.filter((col) =>
      posts.some((p) => p.extras && p.extras[col.key] != null),
    );
  }, [posts, hasExtras]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const view = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (k: keyof Post) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportXlsx = () => {
    const header: string[] = [
      "Título da publicação",
      "Data",
      "Impressões",
      "Alcance",
      "Interações",
      "Engajamento %",
      "#",
    ];
    if (hasRede) header.push("Rede");
    if (hasPostType) header.push("Tipo do Post");
    if (hasPostId) header.push("ID");
    header.push("URL");
    visibleExtras.forEach((c) => header.push(c.label));

    const rows = sorted.map((p) => {
      const row: (string | number | null)[] = [
        p.titulo ?? "",
        formatDate(p.data),
        p.impressions,
        p.reach,
        p.interactions,
        p.engRate != null ? Number((p.engRate * 100).toFixed(2)) / 100 : null,
        p.hashtag ?? "",
      ];
      if (hasRede) row.push(p.rede ?? "");
      if (hasPostType) row.push(p.postType ?? "");
      if (hasPostId) row.push(p.postId ?? "");
      row.push(p.link ?? "");
      visibleExtras.forEach((c) => {
        const v = p.extras?.[c.key];
        if (v == null) row.push(null);
        else if (typeof v === "boolean") row.push(v ? "Sim" : "Não");
        else row.push(v);
      });
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const engColIdx = 5;
    for (let r = 1; r <= rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: engColIdx })];
      if (cell && cell.v != null) cell.z = "0.00%";
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posts");
    XLSX.writeFile(wb, `${exportFileName}.xlsx`);
  };

  const SortHead = ({ k, label }: { k: keyof Post; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
    >
      {label} <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  const totalCols = 6 + (hasPostType ? 1 : 0) + (hasRede ? 1 : 0) + visibleExtras.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{posts.length.toLocaleString("pt-BR")} publicações</p>
        <Button variant="outline" size="sm" onClick={exportXlsx}>
          <Download className="mr-2 h-3.5 w-3.5" /> Exportar Excel
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">{titleLabel}</th>
              {hasRede && <th className="px-4 py-3 text-left">Rede</th>}
              {hasPostType && <th className="px-4 py-3 text-left">Tipo</th>}
              <th className="px-4 py-3 text-left">
                <SortHead k="data" label="Data" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHead k="impressions" label="Impressões" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHead k="reach" label="Alcance" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHead k="interactions" label="Interações" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHead k="engRate" label="Engajamento %" />
              </th>
              {visibleExtras.map((c) => (
                <th key={c.key} className="px-4 py-3 text-right whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhuma publicação encontrada com os filtros atuais.
                </td>
              </tr>
            )}
            {view.map((p, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30">
                <td className="max-w-md px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="line-clamp-2">{p.titulo ?? "—"}</span>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-primary hover:text-primary-glow"
                        title="Abrir publicação"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
                {hasRede && (
                  <td className="whitespace-nowrap px-4 py-3">
                    {p.rede ? (
                      <Badge
                        className={cn(
                          "font-medium border-transparent text-white",
                          p.rede === "Instagram Story"
                            ? "bg-purple-600 hover:bg-purple-600/90"
                            : "bg-blue-600 hover:bg-blue-600/90",
                        )}
                      >
                        {p.rede}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                {hasPostType && (
                  <td className="whitespace-nowrap px-4 py-3">
                    {p.postType ? (
                      <Badge variant="secondary" className="font-medium">{p.postType}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(p.data)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatNum(p.impressions)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatNum(p.reach)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatNum(p.interactions)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{p.engRate != null ? `${(p.engRate * 100).toFixed(2)}%` : "—"}</td>
                {visibleExtras.map((c) => {
                  const v = p.extras?.[c.key];
                  const display =
                    v == null
                      ? null
                      : typeof v === "number"
                      ? formatNum(v)
                      : typeof v === "boolean"
                      ? v ? "Sim" : "Não"
                      : String(v);
                  return (
                    <td key={c.key} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {display != null ? display : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
