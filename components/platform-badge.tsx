import type { CompatibilityStatus } from "@/lib/catalog-types";

const STATUS_PRESENTATION: Readonly<Record<CompatibilityStatus, Readonly<{
  label: string;
  icon: string;
  className: string;
}>>> = Object.freeze({
  native: { label: "原生支持", icon: "●", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  supported: { label: "支持", icon: "✓", className: "border-green-200 bg-green-50 text-green-800" },
  partial: { label: "部分支持", icon: "◐", className: "border-amber-200 bg-amber-50 text-amber-900" },
  unsupported: { label: "不支持", icon: "×", className: "border-red-200 bg-red-50 text-red-800" },
  unknown: { label: "兼容性未知", icon: "?", className: "border-slate-200 bg-slate-100 text-slate-700" },
});

export function getCompatibilityPresentation(status: CompatibilityStatus) {
  return STATUS_PRESENTATION[status];
}

export function PlatformBadge({
  platformName,
  status,
  verifiedAt,
}: Readonly<{
  platformName: string;
  status: CompatibilityStatus;
  verifiedAt?: string;
}>) {
  const presentation = getCompatibilityPresentation(status);
  const verifiedLabel = verifiedAt ? `，最后核验日期 ${verifiedAt}` : "";

  return (
    <span
      aria-label={`${platformName}：${presentation.label}${verifiedLabel}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.className}`}
      title={verifiedAt ? `最后核验：${verifiedAt}` : undefined}
    >
      <span aria-hidden="true">{presentation.icon}</span>
      <span>{platformName}</span>
      <span aria-hidden="true">·</span>
      <span>{presentation.label}</span>
    </span>
  );
}
