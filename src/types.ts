export type PointKind = "acopio" | "necesidad";

export type TrustStatus =
  | "sugerido"
  | "pendiente_verificacion"
  | "verificado"
  | "requiere_reverificacion"
  | "saturado"
  | "cerrado"
  | "duplicado"
  | "rechazado"
  | "archivado";

export type NeedCategory =
  | "agua"
  | "alimentos"
  | "medicinas"
  | "higiene"
  | "bebes"
  | "ropa"
  | "linternas"
  | "transporte"
  | "mascotas"
  | "herramientas"
  | "rescate"
  | "voluntarios"
  | "combustible"
  | "energia"
  | "refugio"
  | "otros";

export type VerificationMethod =
  | "llamada"
  | "whatsapp"
  | "fuente_publica"
  | "encargado"
  | "visita";

export type ReportType =
  | "entregado"
  | "sigue_vigente"
  | "no_reciben"
  | "falso"
  | "saturado";

export interface Source {
  id: string;
  name: string;
  url?: string;
  trustLevel: number;
  importedAt: string;
}

export interface Need {
  id: string;
  centerId: string;
  category: NeedCategory;
  description: string;
  priority: "alta" | "media" | "baja";
  status: "activa" | "suficiente" | "cerrada";
  expiresAt: string;
}

export interface Verification {
  id: string;
  centerId: string;
  method: VerificationMethod;
  volunteerName: string;
  result: "confirmado" | "sin_respuesta" | "cerrado" | "saturado" | "falso";
  notes: string;
  createdAt: string;
}

export interface CommunityReport {
  id: string;
  centerId: string;
  type: ReportType;
  note: string;
  reporterName: string;
  createdAt: string;
}

export interface Center {
  id: string;
  kind: PointKind;
  name: string;
  organization: string;
  state: string;
  city: string;
  address: string;
  contact: string;
  trustStatus: TrustStatus;
  trustLevel: number;
  lat?: number;
  lng?: number;
  lastVerifiedAt?: string;
  sourceId: string;
  receives: NeedCategory[];
  doesNotReceive: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  duplicateOf?: string;
  hiddenFromPublic?: boolean;
}

export interface AppState {
  centers: Center[];
  needs: Need[];
  verifications: Verification[];
  reports: CommunityReport[];
  sources: Source[];
}
