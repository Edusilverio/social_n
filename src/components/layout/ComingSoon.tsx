import { Link } from "@tanstack/react-router";
import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Construction className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        {description ?? "Este módulo está em desenvolvimento e será liberado em breve."}
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link to="/hub">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Hub
        </Link>
      </Button>
    </div>
  );
}
