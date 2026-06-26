import type {
  AppState,
  Center,
  CommunityReport,
  NeedCategory,
  PointKind,
  ReportType,
  TrustStatus,
  Verification,
} from "./types";

export const KIND_LABELS: Record<PointKind, string> = {
  acopio: "Centro de acopio",
  necesidad: "Zona de atencion",
};

export const NEED_LABELS: Record<NeedCategory, string> = {
  agua: "Agua potable",
  alimentos: "Alimentos",
  medicinas: "Medicinas",
  higiene: "Higiene",
  bebes: "Bebes",
  ropa: "Ropa / cobijas",
  linternas: "Linternas / baterias",
  transporte: "Transporte",
  mascotas: "Mascotas",
  herramientas: "Herramientas (picos, palas)",
  rescate: "Rescate / bomberos",
  voluntarios: "Voluntarios / mano de obra",
  combustible: "Combustible",
  energia: "Generadores / energia",
  refugio: "Refugio / carpas",
  otros: "Otros",
};

export const STATUS_LABELS: Record<TrustStatus, string> = {
  sugerido: "Sugerido",
  pendiente_verificacion: "Pendiente",
  verificado: "Verificado",
  requiere_reverificacion: "Reverificar",
  saturado: "Saturado",
  cerrado: "Cerrado",
  duplicado: "Duplicado",
  rechazado: "Rechazado",
  archivado: "Archivado",
};

const PUBLIC_STATUSES = new Set<TrustStatus>([
  "verificado",
  "requiere_reverificacion",
  "saturado",
]);

export function hoursSince(iso: string | undefined, now = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / 36e5;
}

export function applyExpiration(center: Center, now = new Date()): Center {
  if (!center.lastVerifiedAt || center.trustStatus !== "verificado") {
    return center;
  }

  const age = hoursSince(center.lastVerifiedAt, now);
  if (age >= 48) {
    return { ...center, trustStatus: "archivado", hiddenFromPublic: true };
  }
  if (age >= 24) {
    return {
      ...center,
      trustStatus: "requiere_reverificacion",
      hiddenFromPublic: true,
    };
  }
  if (age >= 12) {
    return { ...center, trustStatus: "requiere_reverificacion" };
  }
  return center;
}

export function applyCommunityReports(
  center: Center,
  reports: CommunityReport[],
): Center {
  const negativeReports = reports.filter(
    (report) =>
      report.centerId === center.id &&
      (report.type === "falso" ||
        report.type === "no_reciben" ||
        report.type === "saturado"),
  );

  if (negativeReports.filter((report) => report.type === "falso").length >= 2) {
    return { ...center, trustStatus: "rechazado", hiddenFromPublic: true };
  }

  if (negativeReports.filter((report) => report.type === "no_reciben").length >= 2) {
    return { ...center, trustStatus: "cerrado", hiddenFromPublic: true };
  }

  if (negativeReports.filter((report) => report.type === "saturado").length >= 2) {
    return { ...center, trustStatus: "saturado" };
  }

  return center;
}

export function deriveCenters(state: AppState, now = new Date()): Center[] {
  return state.centers.map((center) =>
    applyCommunityReports(applyExpiration(center, now), state.reports),
  );
}

export function isPublicCenter(center: Center, includeUnverified = false): boolean {
  if (center.hiddenFromPublic || center.trustStatus === "archivado") {
    return false;
  }
  if (includeUnverified) {
    return !["rechazado", "duplicado"].includes(center.trustStatus);
  }
  if (!center.contact?.trim()) {
    return false;
  }
  return PUBLIC_STATUSES.has(center.trustStatus);
}

export function normalizeCenterInput(input: Omit<Center, "id" | "createdAt" | "updatedAt">): Center {
  const now = new Date().toISOString();
  const base = `${input.name}-${input.address}-${now}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

  return {
    ...input,
    id: base || crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

export function addVerification(
  state: AppState,
  centerId: string,
  verification: Omit<Verification, "id" | "centerId" | "createdAt">,
): AppState {
  const now = new Date().toISOString();
  const nextVerification: Verification = {
    ...verification,
    id: crypto.randomUUID(),
    centerId,
    createdAt: now,
  };

  return {
    ...state,
    centers: state.centers.map((center) => {
      if (center.id !== centerId) return center;
      const nextStatus = verificationToStatus(verification.result);
      return {
        ...center,
        trustStatus: nextStatus,
        trustLevel: verification.method === "encargado" ? 3 : Math.max(center.trustLevel, 2),
        lastVerifiedAt: verification.result === "confirmado" ? now : center.lastVerifiedAt,
        hiddenFromPublic: ["falso", "cerrado"].includes(verification.result),
        updatedAt: now,
      };
    }),
    verifications: [nextVerification, ...state.verifications],
  };
}

export function addCommunityReport(
  state: AppState,
  centerId: string,
  report: Omit<CommunityReport, "id" | "centerId" | "createdAt">,
): AppState {
  return {
    ...state,
    reports: [
      {
        ...report,
        id: crypto.randomUUID(),
        centerId,
        createdAt: new Date().toISOString(),
      },
      ...state.reports,
    ],
  };
}

export function flagDuplicate(state: AppState, centerId: string, duplicateOf: string): AppState {
  return {
    ...state,
    centers: state.centers.map((center) =>
      center.id === centerId
        ? {
            ...center,
            duplicateOf,
            trustStatus: "duplicado",
            hiddenFromPublic: true,
            updatedAt: new Date().toISOString(),
          }
        : center,
    ),
  };
}

export function exportCentersCsv(centers: Center[]): string {
  const rows = centers.map((center) => [
    center.id,
    center.kind,
    center.name,
    center.organization,
    center.state,
    center.city,
    center.address,
    center.contact,
    center.trustStatus,
    String(center.trustLevel),
    center.lastVerifiedAt ?? "",
    center.receives.join("|"),
    center.doesNotReceive.join("|"),
    center.notes,
  ]);
  return [
    [
      "id",
      "kind",
      "name",
      "organization",
      "state",
      "city",
      "address",
      "contact",
      "trustStatus",
      "trustLevel",
      "lastVerifiedAt",
      "receives",
      "doesNotReceive",
      "notes",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

export function buildWhatsAppShare(center: Center): string {
  const items = center.receives.map((need) => NEED_LABELS[need]).join(", ");
  const lastVerified = center.lastVerifiedAt
    ? new Date(center.lastVerifiedAt).toLocaleString("es-VE")
    : "sin verificacion";
  const header = center.kind === "necesidad" ? "🆘 Zona de atencion" : "📦 Centro de acopio";
  const itemsLine =
    center.kind === "necesidad" ? `Necesitan: ${items}` : `Reciben: ${items}`;
  const restriction =
    center.kind === "necesidad"
      ? ""
      : `\nNo llevar: ${center.doesNotReceive.join(", ") || "sin restricciones reportadas"}`;
  return encodeURIComponent(
    `${header}\n${center.name}\n${center.address}, ${center.city}\n${itemsLine}${restriction}\nEstado: ${STATUS_LABELS[center.trustStatus]}\nUltima verificacion: ${lastVerified}`,
  );
}

export function reportTypeToStatus(type: ReportType): TrustStatus | null {
  if (type === "saturado") return "saturado";
  if (type === "no_reciben") return "cerrado";
  if (type === "falso") return "rechazado";
  return null;
}

function verificationToStatus(result: Verification["result"]): TrustStatus {
  if (result === "confirmado") return "verificado";
  if (result === "cerrado") return "cerrado";
  if (result === "saturado") return "saturado";
  if (result === "falso") return "rechazado";
  return "requiere_reverificacion";
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
