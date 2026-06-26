import {
  AlertTriangle,
  Clock,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  PlusCircle,
  Search,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  NEED_LABELS,
  STATUS_LABELS,
  buildWhatsAppShare,
  exportCentersCsv,
  hoursSince,
} from "./domain";
import {
  createPoint,
  fetchPointsLite,
  fetchPublicPoints,
  fetchQueue,
  fetchStates,
  fetchStats,
  flagDuplicateRemote,
  submitReport,
  submitVerification,
  type Stats,
} from "./api";
import type {
  Center,
  NeedCategory,
  PointKind,
  ReportType,
  TrustStatus,
  VerificationMethod,
} from "./types";

const NEED_OPTIONS = Object.entries(NEED_LABELS) as [NeedCategory, string][];
const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [TrustStatus, string][];
const PAGE_SIZE = 20;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function App() {
  const [tab, setTab] = useState<"publico" | "voluntarios" | "datos">("publico");
  const [reloadKey, setReloadKey] = useState(0);
  const [stats, setStats] = useState<Stats>({ acopio: 0, necesidad: 0, pending: 0, hidden: 0 });

  const refreshAll = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchStats()
      .then((s) => !cancelled && setStats(s))
      .catch((err) => console.error("stats", err));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="app-shell">
      <Hero stats={stats} />
      <nav className="tabs" aria-label="Vistas principales">
        <button className={tab === "publico" ? "active" : ""} onClick={() => setTab("publico")}>
          <MapPin size={18} /> Buscar ayuda
        </button>
        <button
          className={tab === "voluntarios" ? "active" : ""}
          onClick={() => setTab("voluntarios")}
        >
          <PlusCircle size={18} /> Registrar zona o acopio
        </button>
        <button className={tab === "datos" ? "active" : ""} onClick={() => setTab("datos")}>
          <Database size={18} /> Datos abiertos
        </button>
      </nav>

      <main>
        {tab === "publico" && <PublicView reloadKey={reloadKey} onMutate={refreshAll} />}
        {tab === "voluntarios" && <VolunteerPanel reloadKey={reloadKey} onMutate={refreshAll} />}
        {tab === "datos" && <OpenDataView />}
      </main>
    </div>
  );
}

function Hero({ stats }: { stats: Stats }) {
  return (
    <header className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Open source · datos verificables · Venezuela</p>
        <h1>Verifica Acopio VE</h1>
        <p className="lede">
          <strong>Objetivo:</strong> conectar la ayuda con donde de verdad hace falta. Mostramos en
          un solo lugar los <strong>centros de acopio</strong> que reciben donaciones y las{" "}
          <strong>zonas de atencion</strong> que piden insumos, herramientas o personal.
        </p>
        <p className="lede">
          <strong>El fin:</strong> que cada donacion llegue a un punto real y verificado, evitar
          esfuerzos duplicados o falsos, y dar datos limpios y abiertos a las iniciativas que ya
          estan ayudando.
        </p>
        <div className="hero-actions">
          <a href={`${SUPABASE_URL}/rest/v1/v_points?is_public_default=eq.true`} className="secondary-action">
            <FileJson size={17} /> API en vivo
          </a>
        </div>
      </div>
      <div className="stats-panel" aria-label="Resumen">
        <Stat label="Acopio activo" value={stats.acopio} tone="green" />
        <Stat label="Zonas pidiendo" value={stats.necesidad} tone="blue" />
        <Stat label="Por verificar" value={stats.pending} tone="amber" />
        <Stat label="Ocultos" value={stats.hidden} tone="red" />
      </div>
    </header>
  );
}

function PublicView({ reloadKey, onMutate }: { reloadKey: number; onMutate: () => void }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | PointKind>("all");
  const [need, setNeed] = useState<"all" | NeedCategory>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [stateOptions, setStateOptions] = useState<string[]>([]);

  const [centers, setCenters] = useState<Center[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // debounce del texto de busqueda (evita una consulta por tecla en alto volumen)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    fetchStates()
      .then(setStateOptions)
      .catch((err) => console.error("states", err));
  }, [reloadKey]);

  // reset + primera pagina cuando cambian filtros o se fuerza recarga
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicPoints({
      text: debouncedQuery,
      kind: kindFilter,
      need,
      state: stateFilter,
      onlyVerified,
      page: 0,
      pageSize: PAGE_SIZE,
    })
      .then((r) => {
        if (cancelled) return;
        setCenters(r.centers);
        setTotal(r.total);
        setPage(0);
      })
      .catch((err) => !cancelled && setError(String(err?.message ?? err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, kindFilter, need, stateFilter, onlyVerified, reloadKey]);

  async function loadMore() {
    const next = page + 1;
    setLoading(true);
    try {
      const r = await fetchPublicPoints({
        text: debouncedQuery,
        kind: kindFilter,
        need,
        state: stateFilter,
        onlyVerified,
        page: next,
        pageSize: PAGE_SIZE,
      });
      setCenters((current) => [...current, ...r.centers]);
      setPage(next);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReport(
    centerId: string,
    type: ReportType,
    note: string,
    reporterName: string,
  ) {
    await submitReport(centerId, type, note, reporterName || "Anonimo");
    onMutate();
  }

  return (
    <section className="page-grid">
      <aside className="filters-card">
        <div className="section-heading">
          <Search size={18} />
          <h2>Buscar ayuda util</h2>
        </div>
        <div className="kind-switch" role="group" aria-label="Tipo de punto">
          <button
            type="button"
            className={kindFilter === "all" ? "active" : ""}
            onClick={() => setKindFilter("all")}
          >
            Todo
          </button>
          <button
            type="button"
            className={kindFilter === "acopio" ? "active" : ""}
            onClick={() => setKindFilter("acopio")}
          >
            Acopio
          </button>
          <button
            type="button"
            className={kindFilter === "necesidad" ? "active" : ""}
            onClick={() => setKindFilter("necesidad")}
          >
            Zonas de atencion
          </button>
        </div>
        <label>
          Texto
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Caracas, UCV, agua..."
          />
        </label>
        <label>
          Insumo
          <select value={need} onChange={(event) => setNeed(event.target.value as NeedCategory)}>
            <option value="all">Todos los insumos</option>
            {NEED_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">Todo el pais</option>
            {stateOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={onlyVerified}
            onChange={(event) => setOnlyVerified(event.target.checked)}
          />
          Mostrar solo verificados
        </label>
        {!onlyVerified && (
          <div className="warning-note">
            <AlertTriangle size={16} />
            Se muestran tambien puntos sin verificar. Revisa la etiqueta de estado antes de mover
            grandes donaciones.
          </div>
        )}
      </aside>

      <section className="cards-list" aria-live="polite">
        <div className="list-header">
          <h2>{total} puntos visibles</h2>
          <p>
            Centros de acopio y zonas de atencion. Por defecto solo se muestran los confirmados o
            recientemente reverificados.
          </p>
        </div>
        {error && (
          <div className="warning-note">
            <AlertTriangle size={16} /> Error cargando datos: {error}
          </div>
        )}
        {centers.map((center) => (
          <CenterCard key={center.id} center={center} onReport={handleReport} />
        ))}
        {!loading && centers.length === 0 && !error && (
          <div className="empty-state">
            <Eye size={22} />
            No hay puntos con esos filtros. Prueba incluir no verificados, cambiar el insumo o el
            tipo (acopio / zonas de atencion).
          </div>
        )}
        {loading && (
          <div className="empty-state">
            <Loader2 size={22} className="spin" /> Cargando...
          </div>
        )}
        {!loading && centers.length < total && (
          <button className="secondary-action load-more" onClick={loadMore}>
            Cargar mas ({centers.length}/{total})
          </button>
        )}
      </section>
    </section>
  );
}

function CenterCard({
  center,
  onReport,
}: {
  center: Center;
  onReport: (centerId: string, type: ReportType, note: string, reporterName: string) => Promise<void>;
}) {
  const [reportType, setReportType] = useState<ReportType>("sigue_vigente");
  const [reporterName, setReporterName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const age = center.lastVerifiedAt ? hoursSince(center.lastVerifiedAt) : null;
  const shareUrl = `https://wa.me/?text=${buildWhatsAppShare(center)}`;
  const isNeed = center.kind === "necesidad";

  async function submitReportForm(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onReport(center.id, reportType, note, reporterName || "Anonimo");
      setNote("");
      setReporterName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="center-card">
      <div className="card-topline">
        <span className={`kind-badge kind-${center.kind}`}>
          {isNeed ? "🆘 Zona de atencion" : "📦 Acopio"}
        </span>
        <StatusPill status={center.trustStatus} />
        <span className="trust-level">Nivel {center.trustLevel}</span>
      </div>
      <h3>{center.name}</h3>
      <p className="org">{center.organization || "Organizacion no especificada"}</p>
      <p className="address">
        <MapPin size={15} /> {center.address}, {center.city}, {center.state}
      </p>
      <div className="meta-row">
        <Clock size={15} />
        {center.lastVerifiedAt
          ? `Verificado hace ${Math.round(age ?? 0)} h`
          : "Sin verificacion registrada"}
      </div>
      <p className="needs-label">{isNeed ? "Necesitan urgente:" : "Reciben:"}</p>
      <div className="needs-row">
        {center.receives.map((item) => (
          <span key={item}>{NEED_LABELS[item]}</span>
        ))}
      </div>
      {!isNeed && (
        <div className="do-not">
          <strong>No llevar:</strong>{" "}
          {center.doesNotReceive.length > 0
            ? center.doesNotReceive.join(", ")
            : "sin restricciones reportadas"}
        </div>
      )}
      {center.notes && <p className="notes">{center.notes}</p>}
      <div className="card-actions">
        {center.contact && (
          <a href={`tel:${center.contact}`} className="small-action">
            <Phone size={15} /> Llamar
          </a>
        )}
        <a href={shareUrl} target="_blank" rel="noreferrer" className="small-action">
          <MessageCircle size={15} /> Compartir
        </a>
      </div>
      <form className="quick-report" onSubmit={submitReportForm}>
        <select value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
          <option value="sigue_vigente">{isNeed ? "Sigue necesitando" : "Fui y sigue vigente"}</option>
          <option value="entregado">{isNeed ? "Lleve ayuda aqui" : "Entregue aqui"}</option>
          <option value="no_reciben">{isNeed ? "Ya cubierto / no hace falta" : "No reciben / cerrado"}</option>
          <option value="saturado">{isNeed ? "Ya tienen suficiente" : "Saturado"}</option>
          <option value="falso">No existe / falso</option>
        </select>
        <input
          value={reporterName}
          onChange={(event) => setReporterName(event.target.value)}
          placeholder="Tu nombre (opcional)"
        />
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota breve" />
        <button type="submit" disabled={saving}>
          {saving ? "..." : "Marcar visita"}
        </button>
      </form>
    </article>
  );
}

function VolunteerPanel({ reloadKey, onMutate }: { reloadKey: number; onMutate: () => void }) {
  const [status, setStatus] = useState<"all" | TrustStatus>("all");
  const [centers, setCenters] = useState<Center[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pointsLite, setPointsLite] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchPointsLite()
      .then(setPointsLite)
      .catch((err) => console.error("pointsLite", err));
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchQueue(status, 0, PAGE_SIZE)
      .then((r) => {
        if (cancelled) return;
        setCenters(r.centers);
        setTotal(r.total);
        setPage(0);
      })
      .catch((err) => console.error("queue", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  async function loadMore() {
    const next = page + 1;
    const r = await fetchQueue(status, next, PAGE_SIZE);
    setCenters((current) => [...current, ...r.centers]);
    setPage(next);
  }

  return (
    <section className="volunteer-layout">
      <div className="panel-card">
        <div className="section-heading">
          <Plus size={18} />
          <h2>Registrar zona o acopio</h2>
        </div>
        <NewCenterForm onCreated={onMutate} />
      </div>

      <div className="panel-card queue-card">
        <div className="section-heading">
          <Users size={18} />
          <h2>Cola de verificacion</h2>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value as TrustStatus)}>
          <option value="all">Prioridad operativa</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="queue-list">
          {centers.map((center) => (
            <VerificationCard
              key={center.id}
              center={center}
              pointsLite={pointsLite}
              onMutate={onMutate}
            />
          ))}
          {loading && (
            <div className="empty-state">
              <Loader2 size={22} className="spin" /> Cargando...
            </div>
          )}
          {!loading && centers.length === 0 && (
            <div className="empty-state">No hay elementos en esta cola.</div>
          )}
          {!loading && centers.length < total && (
            <button className="secondary-action load-more" onClick={loadMore}>
              Cargar mas ({centers.length}/{total})
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function NewCenterForm({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<PointKind>("acopio");
  const [receives, setReceives] = useState<NeedCategory[]>(["agua"]);
  const [saving, setSaving] = useState(false);
  const isNeed = kind === "necesidad";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setSaving(true);
    try {
      await createPoint({
        kind,
        name: String(form.get("name") ?? ""),
        organization: String(form.get("organization") ?? ""),
        state: String(form.get("state") ?? ""),
        city: String(form.get("city") ?? ""),
        address: String(form.get("address") ?? ""),
        contact: String(form.get("contact") ?? ""),
        receives,
        doesNotReceive: isNeed
          ? []
          : String(form.get("doesNotReceive") ?? "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
        notes: String(form.get("notes") ?? ""),
      });
      formEl.reset();
      setReceives(["agua"]);
      setKind("acopio");
      onCreated();
    } catch (err) {
      alert(`No se pudo crear: ${(err as Error)?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="kind-switch" role="group" aria-label="Tipo de punto">
        <button type="button" className={!isNeed ? "active" : ""} onClick={() => setKind("acopio")}>
          📦 Centro de acopio
        </button>
        <button
          type="button"
          className={isNeed ? "active" : ""}
          onClick={() => setKind("necesidad")}
        >
          🆘 Zona de atencion
        </button>
      </div>
      <input name="name" required placeholder={isNeed ? "Nombre de la zona o sector" : "Nombre del centro"} />
      <input
        name="organization"
        placeholder={isNeed ? "Quien reporta (vecino, consejo...)" : "Organizacion o encargado"}
      />
      <div className="form-grid">
        <input name="state" required placeholder="Estado" />
        <input name="city" required placeholder="Ciudad" />
      </div>
      <input name="address" required placeholder="Direccion o referencia" />
      <input name="contact" placeholder="Telefono / WhatsApp de contacto" />
      <fieldset>
        <legend>{isNeed ? "Necesitan" : "Reciben"}</legend>
        <div className="checkbox-grid">
          {NEED_OPTIONS.map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={receives.includes(value)}
                onChange={(event) =>
                  setReceives((current) =>
                    event.target.checked
                      ? [...current, value]
                      : current.filter((item) => item !== value),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {!isNeed && <input name="doesNotReceive" placeholder="No reciben (separado por comas)" />}
      <textarea
        name="notes"
        placeholder={isNeed ? "Contexto: cuanta gente, acceso, urgencia..." : "Notas de acceso, horario, fuente..."}
        rows={3}
      />
      <button type="submit" disabled={saving}>
        {saving ? "Creando..." : "Crear como pendiente"}
      </button>
    </form>
  );
}

function VerificationCard({
  center,
  pointsLite,
  onMutate,
}: {
  center: Center;
  pointsLite: { id: string; name: string }[];
  onMutate: () => void;
}) {
  const [method, setMethod] = useState<VerificationMethod>("whatsapp");
  const [result, setResult] = useState<
    "confirmado" | "sin_respuesta" | "cerrado" | "saturado" | "falso"
  >("confirmado");
  const [volunteerName, setVolunteerName] = useState("");
  const [notes, setNotes] = useState("");
  const [duplicateOf, setDuplicateOf] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await submitVerification(center.id, {
        method,
        result,
        volunteerName: volunteerName || "Voluntario",
        notes,
      });
      setNotes("");
      onMutate();
    } catch (err) {
      alert(`No se pudo verificar: ${(err as Error)?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }

  async function fuse() {
    if (!duplicateOf) return;
    await flagDuplicateRemote(center.id, duplicateOf);
    onMutate();
  }

  return (
    <article className="verify-card">
      <div>
        <div className="card-topline">
          <span className={`kind-badge kind-${center.kind}`}>
            {center.kind === "necesidad" ? "🆘 Zona de atencion" : "📦 Acopio"}
          </span>
          <StatusPill status={center.trustStatus} />
        </div>
        <h3>{center.name}</h3>
        <p>{center.address}</p>
        <p className="muted">
          {center.city}, {center.state} · {center.contact || "sin contacto"}
        </p>
      </div>
      <form className="stack-form compact" onSubmit={submit}>
        <div className="form-grid">
          <select value={method} onChange={(event) => setMethod(event.target.value as VerificationMethod)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="llamada">Llamada</option>
            <option value="fuente_publica">Fuente publica</option>
            <option value="encargado">Encargado</option>
            <option value="visita">Visita</option>
          </select>
          <select value={result} onChange={(event) => setResult(event.target.value as typeof result)}>
            <option value="confirmado">Confirmado</option>
            <option value="sin_respuesta">Sin respuesta</option>
            <option value="cerrado">Cerrado</option>
            <option value="saturado">Saturado</option>
            <option value="falso">Falso</option>
          </select>
        </div>
        <input
          value={volunteerName}
          onChange={(event) => setVolunteerName(event.target.value)}
          placeholder="Voluntario"
        />
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Resultado" />
        <button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar verificacion"}
        </button>
      </form>
      <div className="duplicate-row">
        <select value={duplicateOf} onChange={(event) => setDuplicateOf(event.target.value)}>
          <option value="">Marcar duplicado de...</option>
          {pointsLite
            .filter((item) => item.id !== center.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <button type="button" disabled={!duplicateOf} onClick={fuse}>
          Fusionar
        </button>
      </div>
    </article>
  );
}

function OpenDataView() {
  const [exporting, setExporting] = useState(false);

  async function exportData(format: "json" | "csv") {
    setExporting(true);
    try {
      const r = await fetchPublicPoints({
        text: "",
        kind: "all",
        need: "all",
        state: "all",
        onlyVerified: false,
        page: 0,
        pageSize: 1000,
      });
      const content =
        format === "json" ? JSON.stringify(r.centers, null, 2) : exportCentersCsv(r.centers);
      const mime = format === "json" ? "application/json" : "text/csv";
      const href = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
      const a = document.createElement("a");
      a.href = href;
      a.download = `verifica-acopio.${format}`;
      a.click();
    } finally {
      setExporting(false);
    }
  }

  const restBase = `${SUPABASE_URL}/rest/v1`;

  return (
    <section className="open-data">
      <div className="panel-card">
        <div className="section-heading">
          <Database size={18} />
          <h2>Datos abiertos</h2>
        </div>
        <p>
          Los datos viven en Supabase y se sirven en vivo via PostgREST. La API es de solo lectura
          publica (sin datos privados de voluntarios). Los botones exportan el dataset publico
          actual.
        </p>
        <div className="hero-actions">
          <button className="secondary-action" disabled={exporting} onClick={() => exportData("json")}>
            <FileJson size={17} /> {exporting ? "Exportando..." : "Descargar JSON"}
          </button>
          <button className="secondary-action" disabled={exporting} onClick={() => exportData("csv")}>
            <Download size={17} /> {exporting ? "Exportando..." : "Descargar CSV"}
          </button>
        </div>
      </div>
      <div className="panel-card">
        <h3>Endpoints en vivo</h3>
        <ul className="contract-list">
          <li>
            <a href={`${restBase}/v_points?is_public_default=eq.true`} target="_blank" rel="noreferrer">
              Centros y zonas verificados <ExternalLink size={14} />
            </a>
          </li>
          <li>
            <a href={`${restBase}/v_points?kind=eq.necesidad&is_public_default=eq.true`} target="_blank" rel="noreferrer">
              Solo zonas que necesitan <ExternalLink size={14} />
            </a>
          </li>
          <li>
            <a href={`${restBase}/v_states`} target="_blank" rel="noreferrer">
              Estados con datos <ExternalLink size={14} />
            </a>
          </li>
        </ul>
        <p className="muted">
          Nota: estos endpoints requieren el header <code>apikey</code> con la publishable key del
          proyecto.
        </p>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: TrustStatus }) {
  return <span className={`status-pill status-${status}`}>{STATUS_LABELS[status]}</span>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`stat stat-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
