import { supabase } from "./supabase";
import type {
  Center,
  NeedCategory,
  PointKind,
  TrustStatus,
  VerificationMethod,
} from "./types";

// Columnas de la vista derivada que mostramos (omitimos search_tsv a proposito:
// la usamos para filtrar full-text, pero no la traemos al cliente).
const DISPLAY_COLUMNS =
  "id,kind,name,organization,state,city,address,contact,trust_level,lat,lng," +
  "last_verified_at,source_id,receives,does_not_receive,notes,duplicate_of," +
  "created_at,updated_at,trust_status,hidden_from_public,is_public_default,is_verified";

// La fila de la vista (snake_case) tal como llega de PostgREST.
interface PointRow {
  id: string;
  kind: PointKind;
  name: string;
  organization: string;
  state: string;
  city: string;
  address: string;
  contact: string;
  trust_status: TrustStatus;
  trust_level: number;
  lat: number | null;
  lng: number | null;
  last_verified_at: string | null;
  source_id: string | null;
  receives: NeedCategory[];
  does_not_receive: string[];
  notes: string;
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
  hidden_from_public: boolean;
}

function mapRow(row: PointRow): Center {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    organization: row.organization,
    state: row.state,
    city: row.city,
    address: row.address,
    contact: row.contact,
    trustStatus: row.trust_status,
    trustLevel: row.trust_level,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    sourceId: row.source_id ?? "community",
    receives: row.receives ?? [],
    doesNotReceive: row.does_not_receive ?? [],
    notes: row.notes,
    duplicateOf: row.duplicate_of ?? undefined,
    hiddenFromPublic: row.hidden_from_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PublicQuery {
  text: string;
  kind: "all" | PointKind;
  need: "all" | NeedCategory;
  state: string; // "all" o un estado concreto
  onlyVerified: boolean; // si true, filtra a solo puntos verificados
  page: number; // base 0
  pageSize: number;
}

export interface Paged {
  centers: Center[];
  total: number;
}

// Vista publica: todo el filtrado y la paginacion ocurren en el servidor.
export async function fetchPublicPoints(q: PublicQuery): Promise<Paged> {
  const from = q.page * q.pageSize;
  const to = from + q.pageSize - 1;

  let query = supabase
    .from("v_points")
    .select(DISPLAY_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  // Base: todo lo mostrable (verificacion no requerida).
  query = query.eq("is_public_default", true);
  // Filtro opcional: solo verificados.
  if (q.onlyVerified) query = query.eq("is_verified", true);

  if (q.kind !== "all") query = query.eq("kind", q.kind);
  if (q.state !== "all") query = query.eq("state", q.state);
  if (q.need !== "all") query = query.contains("receives", [q.need]);
  if (q.text.trim()) {
    query = query.textSearch("search_tsv", q.text.trim(), {
      type: "websearch",
      config: "simple",
    });
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { centers: (data as unknown as PointRow[]).map(mapRow), total: count ?? 0 };
}

const QUEUE_EXCLUDE: TrustStatus[] = [
  "verificado",
  "duplicado",
  "rechazado",
  "archivado",
];

// Cola del panel voluntario, tambien paginada server-side.
export async function fetchQueue(
  status: "all" | TrustStatus,
  page: number,
  pageSize: number,
): Promise<Paged> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("v_points")
    .select(DISPLAY_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (status === "all") {
    query = query.not("trust_status", "in", `(${QUEUE_EXCLUDE.join(",")})`);
  } else {
    query = query.eq("trust_status", status);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { centers: (data as unknown as PointRow[]).map(mapRow), total: count ?? 0 };
}

export async function fetchStates(): Promise<string[]> {
  const { data, error } = await supabase.from("v_states").select("state");
  if (error) throw error;
  return (data as { state: string }[]).map((r) => r.state);
}

export interface Stats {
  acopio: number;
  necesidad: number;
  pending: number;
  hidden: number;
}

// Conteos con head:true -> no traen filas, solo el total. Barato en volumen.
export async function fetchStats(): Promise<Stats> {
  const activeKind = (kind: PointKind) =>
    supabase
      .from("v_points")
      .select("id", { count: "exact", head: true })
      .eq("is_public_default", true)
      .eq("kind", kind);

  const pendingQ = supabase
    .from("v_points")
    .select("id", { count: "exact", head: true })
    .in("trust_status", ["sugerido", "pendiente_verificacion", "requiere_reverificacion"]);

  const hiddenQ = supabase
    .from("v_points")
    .select("id", { count: "exact", head: true })
    .or("hidden_from_public.eq.true,trust_status.eq.archivado");

  const [acopio, necesidad, pending, hidden] = await Promise.all([
    activeKind("acopio"),
    activeKind("necesidad"),
    pendingQ,
    hiddenQ,
  ]);

  return {
    acopio: acopio.count ?? 0,
    necesidad: necesidad.count ?? 0,
    pending: pending.count ?? 0,
    hidden: hidden.count ?? 0,
  };
}

export interface NewPointInput {
  kind: PointKind;
  name: string;
  organization: string;
  state: string;
  city: string;
  address: string;
  contact: string;
  receives: NeedCategory[];
  doesNotReceive: string[];
  notes: string;
}

export async function createPoint(input: NewPointInput): Promise<void> {
  const { error } = await supabase.from("points").insert({
    kind: input.kind,
    name: input.name,
    organization: input.organization,
    state: input.state,
    city: input.city,
    address: input.address,
    contact: input.contact,
    trust_status: "pendiente_verificacion",
    trust_level: input.contact.trim() ? 1 : 0,
    source_id: "community",
    receives: input.receives,
    does_not_receive: input.doesNotReceive,
    notes: input.notes,
    hidden_from_public: false,
  });
  if (error) throw error;
}

export interface VerificationInput {
  method: VerificationMethod;
  volunteerName: string;
  result: "confirmado" | "sin_respuesta" | "cerrado" | "saturado" | "falso";
  notes: string;
}

// El trigger apply_verification() actualiza el punto automaticamente.
export async function submitVerification(
  pointId: string,
  v: VerificationInput,
): Promise<void> {
  const { error } = await supabase.from("verifications").insert({
    point_id: pointId,
    method: v.method,
    volunteer_name: v.volunteerName,
    result: v.result,
    notes: v.notes,
  });
  if (error) throw error;
}

// El trigger bump_report_counter() incrementa los contadores del punto.
export async function submitReport(
  pointId: string,
  type: string,
  note: string,
  reporterName: string,
): Promise<void> {
  const { error } = await supabase.from("reports").insert({
    point_id: pointId,
    type,
    note,
    reporter_name: reporterName,
  });
  if (error) throw error;
}

export async function flagDuplicateRemote(
  pointId: string,
  duplicateOf: string,
): Promise<void> {
  const { error } = await supabase
    .from("points")
    .update({
      duplicate_of: duplicateOf,
      trust_status: "duplicado",
      hidden_from_public: true,
    })
    .eq("id", pointId);
  if (error) throw error;
}

// Para el selector de "marcar duplicado de...": lista ligera de puntos.
export async function fetchPointsLite(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("points")
    .select("id,name")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as { id: string; name: string }[];
}
