import { useEffect, useState } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const NULL_HASHTAG = "__NULL__";

export interface SocialFilterValues {
  startDate?: string;
  endDate?: string;
  search?: string;
  /**
   * Hashtags SELECIONADAS (inclusão). `undefined` significa "todas".
   * Array vazio significa "nenhuma".
   */
  hashtags?: string[];
  postType?: string;
  /** Tipos de post SELECIONADOS (inclusão). `undefined` = todos. */
  postTypes?: string[];
}

interface Props {
  value: SocialFilterValues;
  onChange: (v: SocialFilterValues) => void;
  showPostType?: boolean;
  hashtags?: string[];
  /** Quando fornecido, renderiza Tipo de Post como multi-select. */
  postTypes?: string[];
  /** Estado ao qual "Limpar" deve retornar (ex.: mês do maxDate). Default: objeto vazio. */
  defaults?: SocialFilterValues;

}

interface MultiSelectProps {
  label: string;
  options: string[];
  /** Valores selecionados; `undefined` = todos. */
  selected: string[] | undefined;
  onChange: (selected: string[] | undefined) => void;
  placeholder?: string;
  nullLabel?: string;
  nullValue?: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Carregando…",
  nullLabel,
  nullValue,
}: MultiSelectProps) {
  const allOptions = nullValue ? [...options, nullValue] : options;
  // `undefined` = todos selecionados
  const selectedSet = new Set(selected ?? allOptions);
  const selectedCount = selectedSet.size;

  const emit = (nextSet: Set<string>) => {
    if (nextSet.size === allOptions.length) onChange(undefined); // todos → null no server
    else onChange(Array.from(nextSet));
  };

  const toggle = (h: string) => {
    const next = new Set(selectedSet);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    emit(next);
  };
  const selectAll = () => onChange(undefined);
  const selectNone = () => onChange([]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal">
            <span className="truncate">
              {allOptions.length === 0
                ? placeholder
                : `${selectedCount} de ${allOptions.length} selecionada(s)`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center justify-between border-b border-border p-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={selectAll}>
              Marcar tudo
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={selectNone}
            >
              Desmarcar tudo
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {allOptions.map((h) => {
              const checked = selectedSet.has(h);
              const display = nullValue && h === nullValue ? nullLabel ?? "(vazio)" : h;
              return (
                <label
                  key={h}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(h)} />
                  <span className="truncate">{display}</span>
                  {checked && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </label>
              );
            })}
            {allOptions.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhum item disponível
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SocialFilters({ value, onChange, showPostType, hashtags, postTypes, defaults }: Props) {
  const [draft, setDraft] = useState(value);

  // Ressincroniza o draft quando o prop `value` muda de fora (defaults carregados por hook async).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const apply = () => onChange(draft);
  const clear = () => {
    const reset = defaults ?? {};
    setDraft(reset);
    onChange(reset);
  };


  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Início</Label>
          <Input
            type="date"
            value={draft.startDate ?? ""}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fim</Label>
          <Input
            type="date"
            value={draft.endDate ?? ""}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value || undefined })}
          />
        </div>
        <MultiSelect
          label="Hashtags"
          options={hashtags ?? []}
          selected={draft.hashtags}
          onChange={(selected) => setDraft({ ...draft, hashtags: selected })}
          nullValue={NULL_HASHTAG}
          nullLabel="(sem hashtag)"
        />
        {showPostType && postTypes && (
          <MultiSelect
            label="Tipo de post"
            options={postTypes}
            selected={draft.postTypes}
            onChange={(selected) => setDraft({ ...draft, postTypes: selected })}
          />
        )}
        {showPostType && !postTypes && (
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de post</Label>
            <Input
              placeholder="Imagem, Vídeo…"
              value={draft.postType ?? ""}
              onChange={(e) => setDraft({ ...draft, postType: e.target.value || undefined })}
            />
          </div>
        )}
        <div className="space-y-1.5 lg:col-span-1">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Título, descrição…"
              value={draft.search ?? ""}
              onChange={(e) => setDraft({ ...draft, search: e.target.value || undefined })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="mr-1 h-3.5 w-3.5" /> Limpar
        </Button>
        <Button size="sm" onClick={apply}>Aplicar filtros</Button>
      </div>
    </div>
  );
}
