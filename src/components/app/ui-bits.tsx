import type { ReactNode } from "react";
import { BadgeCheck, CircleDashed, PenLine, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTRY } from "@/lib/format";
import type { DataSource } from "@/lib/domain/types";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  eyebrow?: string | undefined;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-primary [&_svg]:size-6">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SourceBadge({ source, verified }: { source: DataSource; verified?: boolean }) {
  if (source === "imported" && verified)
    return (
      <Badge variant="verified" className="gap-1">
        <BadgeCheck className="size-3" /> Doğrulanmış
      </Badge>
    );
  if (source === "imported")
    return (
      <Badge variant="info" className="gap-1">
        <PlugZap className="size-3" /> İçe aktarıldı
      </Badge>
    );
  return (
    <Badge variant="manual" className="gap-1">
      <PenLine className="size-3" /> Manuel
    </Badge>
  );
}

export function NotConnectedBadge() {
  return (
    <Badge variant="neutral" className="gap-1">
      <CircleDashed className="size-3" /> Bağlı değil
    </Badge>
  );
}

export function Money({
  value,
  className,
  sign,
}: {
  value: number | null | undefined;
  className?: string | undefined;
  /** Show deductions with a leading minus. */
  sign?: "minus" | undefined;
}) {
  const v = value ?? null;
  return (
    <span
      className={cn(
        "num whitespace-nowrap",
        v != null && v < 0 && !sign && "text-destructive",
        className,
      )}
    >
      {sign === "minus" && v ? "− " : ""}
      {formatTRY(v)}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode | undefined;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
