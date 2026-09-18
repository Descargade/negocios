import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Radar,
  Search,
  Users,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
  Plus,
  ArrowUpRight,
  Download,
  Upload,
  ShieldCheck,
  LogOut,
  Check,
  Copy,
  Menu,
  X,
  ChevronRight,
  CircleHelp,
  Ban,
  Inbox,
  ArrowRight,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  stages,
  sectors,
  webStates,
  reviews,
  criteria,
  messageTypes,
  defaultSettings,
  argentinaToday,
  money,
  score,
  duplicates,
  renderMessage,
  csvFields,
  csvSafe,
} from "../../../shared/radar.mjs";
import "./index.css";

type Item = Record<string, any>;
const blank = () => ({
  name: "",
  sector: "Gráfica",
  city: "",
  website: "",
  social: "",
  phone: "",
  email: "",
  source: "",
  consultedAt: argentinaToday(),
  verifiedAt: "",
  review: "Pendiente",
  webStatus: "Pendiente",
  contactPerson: "",
  notes: "",
  opportunity: "",
  service: "",
  quotedCents: 0,
  wonCents: 0,
  stage: "Nuevo",
  noContact: false,
  signals: Object.fromEntries(
    criteria.map(([key]) => [key, { value: "unknown", evidence: "" }]),
  ),
});
const fields = Object.keys(blank());
const dateLabel = (v: string) =>
  v
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(v.length === 10 ? v + "T12:00:00-03:00" : v))
    : "Sin fecha";
const timestamp = (v: string) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(v));
const inputMoney = (value: string) => Math.round(Number(value) * 100);
async function api(path: string, body?: unknown) {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    headers: body
      ? { "Content-Type": "application/json", "X-Radar-Request": "1" }
      : {},
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "No se pudo completar la solicitud."),
      { status: response.status, details: result.details },
    );
  return result;
}
function Field({
  label,
  value,
  onChange,
  options,
  type = "text",
  required = false,
  wide = false,
  ...rest
}: any) {
  return (
    <label className={"field" + (wide ? " wide" : "")}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        >
          {options.map((s: string) => (
            <option key={s} value={s}>
              {(
                {
                  unknown: "Pendiente",
                  yes: "Confirmada",
                  no: "Descartada",
                  note: "Observación",
                  contact: "Contacto realizado",
                  response: "Respuesta recibida",
                } as Record<string, string>
              )[s] ||
                s ||
                "Todos"}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          {...rest}
        />
      )}
    </label>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({ open, onClose, title, description, children }: any) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal">
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Cerrar ficha">
              <X />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Tag({ children, tone = "" }: any) {
  return <span className={"tag " + tone}>{children}</span>;
}
function ScoreTag({ p }: any) {
  const s = score(p);
  return (
    <Tag tone={s.insufficient ? "muted" : s.value >= 60 ? "cyan" : "purple"}>
      {s.insufficient ? "Sin evaluar" : s.value + " / 100"}
    </Tag>
  );
}

export default function App() {
  const [auth, setAuth] = useState<"loading" | "login" | "ready" | "setup">(
      "loading",
    ),
    [password, setPassword] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null),
    [page, setPage] = useState("Radar"),
    [sidebar, setSidebar] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [sector, setSector] = useState("Gráfica"),
    [city, setCity] = useState("Buenos Aires"),
    [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState(""),
    [stageFilter, setStageFilter] = useState(""),
    [webFilter, setWebFilter] = useState(""),
    [reviewFilter, setReviewFilter] = useState(""),
    [view, setView] = useState("table");
  const [editVersion, setEditVersion] = useState(0);
  const [edit, setEdit] = useState<Item | null>(null),
    [detailTab, setDetailTab] = useState("Ficha");
  const [taskTitle, setTaskTitle] = useState("Volver a contactar"),
    [taskDue, setTaskDue] = useState(argentinaToday()),
    [taskEdit, setTaskEdit] = useState<Item | null>(null);
  const [note, setNote] = useState(""),
    [noteKind, setNoteKind] = useState("note");
  const [messageType, setMessageType] = useState(messageTypes[0]),
    [channel, setChannel] = useState("WhatsApp"),
    [draft, setDraft] = useState(""),
    [draftId, setDraftId] = useState<string | undefined>();
  const [payment, setPayment] = useState(""),
    [paymentDate, setPaymentDate] = useState(argentinaToday()),
    [paymentNote, setPaymentNote] = useState(""),
    [paymentId, setPaymentId] = useState<string | undefined>();
  const [settings, setSettings] = useState<any>(
    structuredClone(defaultSettings),
  );
  const [importOpen, setImportOpen] = useState(false),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [selectedRows, setSelectedRows] = useState<number[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const state = snapshot?.state;
  const prospects: Item[] = state?.prospects || [],
    tasks: Item[] = state?.tasks || [],
    drafts: Item[] = state?.drafts || [];
  const [today, setToday] = useState(argentinaToday());
  useEffect(() => {
    const t = setInterval(() => setToday(argentinaToday()), 60000);
    return () => clearInterval(t);
  }, []);
  const activeTasks = tasks.filter(
    (t) =>
      t.status === "pending" &&
      !prospects.find((p) => p.id === t.prospectId)?.noContact,
  );
  const overdue = activeTasks.filter((t) => t.due < today);
  const current = edit?.id ? prospects.find((p) => p.id === edit.id) : null;
  const filtered = prospects.filter(
    (p) =>
      (!filter ||
        [p.name, p.city, p.sector, p.notes]
          .join(" ")
          .toLowerCase()
          .includes(filter.toLowerCase())) &&
      (!stageFilter || p.stage === stageFilter) &&
      (!webFilter || p.webStatus === webFilter) &&
      (!reviewFilter || p.review === reviewFilter),
  );
  const query = [sector, city, keyword].filter(Boolean).join(" ");
  async function load() {
    const data = await api("/state");
    setSnapshot(data);
    return data;
  }
  useEffect(() => {
    api("/session")
      .then(async (s) => {
        if (s.authenticated) {
          const data = await load();
          setSettings(data.state.settings);
          setAuth("ready");
        } else setAuth("login");
      })
      .catch((e) => {
        setError(e.message);
        setAuth(e.status === 503 ? "setup" : "login");
      });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  function handleError(e: any) {
    setError(e.message);
    if (e.status === 401) {
      setAuth("login");
      setSnapshot(null);
      setEdit(null);
      setPassword("");
    }
  }
  async function run(fn: () => Promise<any>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      handleError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function action(
    type: string,
    payload: any,
    version = snapshot?.version,
  ) {
    const result = await api("/action", { type, payload, version });
    if (type !== "contactAction") {
      const fresh = await load();
      if (edit?.id && type !== "saveProspect") {
        const updated = fresh.state.prospects.find(
          (p: Item) => p.id === edit.id,
        );
        if (updated) {
          setEdit(updated);
          setEditVersion(fresh.version);
        }
      }
    }
    return result;
  }
  function openProspect(p?: Item) {
    setEditVersion(snapshot.version);
    setEdit(p ? structuredClone(p) : { ...blank(), sector, city });
    setDetailTab("Ficha");
    setDraft("");
    setDraftId(undefined);
    setNote("");
    setTaskEdit(null);
    setTaskTitle("Volver a contactar");
    setTaskDue(today);
    setPayment("");
    setPaymentId(undefined);
    setError("");
  }
  function change(key: string, value: any) {
    setEdit((p) => ({ ...p, [key]: value }));
  }
  async function saveProspect(allowDuplicate = false) {
    if (!edit) return;
    const data = Object.fromEntries(
      fields.map((f) => [
        f,
        edit[f] ?? blank()[f as keyof ReturnType<typeof blank>],
      ]),
    );
    try {
      const result = await action(
        "saveProspect",
        { id: edit.id, data, allowDuplicate },
        editVersion,
      );
      setEdit(null);
      setNotice("Prospecto guardado.");
      return result;
    } catch (e: any) {
      if (e.details && Array.isArray(e.details)) {
        const names = e.details
          .map((p: any) => p.name + " · " + p.city)
          .join("\n");
        if (
          window.confirm(
            "Encontramos posibles duplicados:\n" +
              names +
              "\n\n¿Confirmás que es un negocio distinto y querés guardarlo por separado?",
          )
        )
          return saveProspect(true);
      } else throw e;
    }
  }
  function download(
    name: string,
    content: string,
    type = "text/csv;charset=utf-8",
  ) {
    const href = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function exportContacts() {
    const response = await fetch("/api/export");
    if (!response.ok) throw new Error("No se pudo exportar. Revisá tu sesión.");
    download("2blea-radar-contactos.csv", await response.text());
    setNotice("Contactos exportados.");
  }
  function switchPage(next: string) {
    setPage(next);
    setSidebar(false);
    setError("");
    if (next === "Configuración") setSettings(structuredClone(state.settings));
  }
  const nav = [
    ["Radar", Radar],
    ["CRM", Users],
    ["Seguimientos", CalendarDays],
    ["Resumen", ChartNoAxesCombined],
    ["Configuración", Settings],
  ] as const;
  const taskList = (list: Item[]) =>
    list.length ? (
      <div className="task-list">
        {[...list]
          .sort((a, b) => a.due.localeCompare(b.due))
          .map((t) => {
            const p = prospects.find((p) => p.id === t.prospectId);
            return (
              <div key={t.id} className="task-row">
                <div>
                  <button
                    className="text-button"
                    onClick={() => openProspect(p)}
                  >
                    {t.title}
                  </button>
                  <p>
                    {p?.name} ·{" "}
                    <span
                      className={
                        t.due < today && t.status === "pending"
                          ? "danger-text"
                          : ""
                      }
                    >
                      {dateLabel(t.due)}
                    </span>{" "}
                    ·{" "}
                    {t.status === "done"
                      ? "Completada"
                      : t.status === "paused"
                        ? "Pausada"
                        : "Pendiente"}
                  </p>
                </div>
                <div className="actions">
                  <button
                    disabled={busy || p?.noContact}
                    onClick={() => {
                      openProspect(p);
                      setDetailTab("Seguimientos");
                      setTaskEdit(t);
                      setTaskTitle(t.title);
                      setTaskDue(t.due);
                    }}
                  >
                    Reprogramar
                  </button>
                  {t.status === "pending" && (
                    <button
                      className="icon-button"
                      aria-label={"Completar " + t.title}
                      disabled={busy || p?.noContact}
                      onClick={() =>
                        run(async () => {
                          await action("task", {
                            id: t.id,
                            prospectId: t.prospectId,
                            title: t.title,
                            due: t.due,
                            status: "done",
                          });
                          setNotice("Seguimiento completado.");
                        })
                      }
                    >
                      <Check size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    ) : (
      <p className="muted pad">No hay tareas en este grupo.</p>
    );
  const table = filtered.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Presencia web</th>
            <th>Oportunidad / prioridad</th>
            <th>Fuente y consulta</th>
            <th>Etapa</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>
                <button
                  className="business-name"
                  onClick={() => openProspect(p)}
                >
                  {p.name}
                </button>
                <div className="meta">
                  {p.sector} · {p.city}
                </div>
                {p.noContact && <Tag tone="danger">No contactar</Tag>}
              </td>
              <td>
                <div>{p.webStatus}</div>
                <span className="meta">{p.review}</span>
              </td>
              <td>
                <ScoreTag p={p} />
                <p className="opportunity">
                  {p.opportunity || "Pendiente de revisión"}
                </p>
              </td>
              <td>
                {p.source ? (
                  <a href={p.source} target="_blank" rel="noreferrer">
                    Ver origen <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <span className="meta">Sin fuente</span>
                )}
                <div className="meta">{dateLabel(p.consultedAt)}</div>
              </td>
              <td>
                <select
                  aria-label={"Etapa de " + p.name}
                  value={p.stage}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value === "Ganado" && !p.wonCents) {
                      openProspect(p);
                      setEdit({ ...p, stage: "Ganado" });
                      return;
                    }
                    run(() =>
                      action("stage", { id: p.id, stage: e.target.value }),
                    );
                  }}
                >
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Abrir " + p.name}
                  onClick={() => openProspect(p)}
                >
                  <ChevronRight size={19} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title={
        prospects.length
          ? "No hay coincidencias"
          : "Tu próximo cliente empieza con una búsqueda"
      }
      action={
        <button className="primary" onClick={() => openProspect()}>
          <Plus size={17} /> Registrar negocio
        </button>
      }
    >
      {prospects.length
        ? "Probá con otros filtros."
        : "Buscá un negocio, revisá su presencia digital y guardá lo que puedas verificar. Tu cuenta empieza sin datos de ejemplo."}
    </Empty>
  );
  if (auth !== "ready")
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand">
            <Radar />
            <span>
              2bleA <b>Radar</b>
            </span>
          </div>
          <Tag tone="cyan">
            <ShieldCheck size={14} /> Espacio privado
          </Tag>
          <h1>
            Tu próxima oportunidad,
            <br />
            bien organizada.
          </h1>
          <p>Ingresá con la contraseña de propietario para abrir tu CRM.</p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {auth === "loading" ? (
            <p role="status">Comprobando sesión…</p>
          ) : auth === "setup" ? (
            <div className="banner">
              La aplicación permanece cerrada hasta configurar el acceso en el
              servidor. No hay registro público ni contraseña predeterminada.
              <button onClick={() => location.reload()}>
                Volver a comprobar
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api("/login", { password });
                  setPassword("");
                  const data = await load();
                  setSettings(data.state.settings);
                  setAuth("ready");
                });
              }}
            >
              <Field
                label="Contraseña de propietario"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
              <button className="primary full" disabled={busy}>
                {busy ? "Ingresando…" : "Entrar a Radar"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <small>Prospección con criterio. Sin envíos automáticos.</small>
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={sidebar ? "sidebar visible" : "sidebar"}>
        <div className="brand">
          <Radar />
          <span>
            2bleA <b>Radar</b>
          </span>
          <button
            className="mobile-only icon-button"
            aria-label="Cerrar menú"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">ESPACIO COMERCIAL</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "nav-item active" : "nav-item"}
              onClick={() => switchPage(name)}
            >
              <Icon size={20} />
              {name}
              {name === "Seguimientos" && overdue.length > 0 && (
                <span className="nav-count">{overdue.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <div>
              Acceso de propietario<small>{snapshot.storage}</small>
            </div>
          </div>
          <button
            className="account"
            onClick={() => switchPage("Configuración")}
          >
            <span className="avatar">AG</span>
            <span>
              {state.settings.name}
              <small>{state.settings.brand}</small>
            </span>
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-only icon-button"
              aria-label="Abrir menú"
              onClick={() => setSidebar(true)}
            >
              <Menu />
            </button>
            <span className="muted">Mi espacio</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div>
            <span className="date-top">{dateLabel(today)} · Argentina</span>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={() =>
                run(async () => {
                  await api("/logout", {});
                  setSnapshot(null);
                  setAuth("login");
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error sticky-message">
              {error}
              <button
                onClick={() =>
                  run(async () => {
                    await load();
                    setError("");
                  })
                }
              >
                Recargar datos
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="success sticky-message">
              <Check size={18} />
              {notice}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                2BLEA / {page === "Radar" ? "PROSPECCIÓN" : page.toUpperCase()}
              </div>
              <h1>
                {page === "Radar"
                  ? "Buscá tu próxima oportunidad"
                  : page === "CRM"
                    ? "Tus oportunidades"
                    : page === "Seguimientos"
                      ? "Que ninguna conversación se pierda"
                      : page === "Resumen"
                        ? "Tu actividad comercial"
                        : "Tu espacio, a tu manera"}
              </h1>
              <p>
                {page === "Radar"
                  ? "Encontrá negocios, revisá las señales y prepará el próximo paso."
                  : page === "CRM"
                    ? "Cada negocio, su contexto y el siguiente paso."
                    : page === "Seguimientos"
                      ? "Recordatorios dentro de la app · Horario de Buenos Aires."
                      : page === "Resumen"
                        ? "Presupuestos, ventas y cobros: cada cosa en su lugar."
                        : "Datos de marca, servicios, plantillas e integraciones."}
              </p>
            </div>
            {["Radar", "CRM"].includes(page) && (
              <button className="primary" onClick={() => openProspect()}>
                <Plus size={18} /> Nuevo prospecto
              </button>
            )}
          </div>
          {page === "Radar" && (
            <>
              <section className="search-panel">
                <div className="section-heading">
                  <h2>
                    <Search size={20} /> Buscar negocios
                  </h2>
                  <Tag tone="purple">Búsqueda asistida</Tag>
                </div>
                <div className="search-grid">
                  <Field
                    label="Rubro"
                    value={sector}
                    onChange={setSector}
                    options={sectors}
                  />
                  <Field
                    label="Ciudad o zona"
                    value={city}
                    onChange={setCity}
                    placeholder="Ej.: Palermo, CABA"
                  />
                  <Field
                    label="Palabras clave"
                    value={keyword}
                    onChange={setKeyword}
                    placeholder="Ej.: impresión, vinilos"
                  />
                </div>
                <div className="search-actions">
                  <a
                    className="button primary"
                    href={
                      "https://www.google.com/search?q=" +
                      encodeURIComponent(query)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Search size={17} /> Buscar en Google{" "}
                    <ArrowUpRight size={16} />
                  </a>
                  <a
                    className="button"
                    href={
                      "https://www.google.com/maps/search/?api=1&query=" +
                      encodeURIComponent(query)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir Maps <ArrowUpRight size={16} />
                  </a>
                  <a
                    className="button"
                    href={
                      "https://www.google.com/search?q=" +
                      encodeURIComponent("site:instagram.com " + query)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buscar perfiles <ArrowUpRight size={16} />
                  </a>
                </div>
                <div className="search-note">
                  <CircleHelp size={17} />
                  <div>
                    <strong>Búsqueda automática pendiente de conexión</strong>
                    <p>
                      Estos enlaces abren buscadores externos. Revisá el negocio
                      y registralo con su fuente. No encontrar una web no
                      confirma que no exista.
                    </p>
                  </div>
                </div>
              </section>
              <div className="flow-strip">
                <span>
                  <b>01</b> Buscá
                </span>
                <ChevronRight />
                <span>
                  <b>02</b> Revisá la evidencia
                </span>
                <ChevronRight />
                <span>
                  <b>03</b> Guardá y seguí
                </span>
              </div>
            </>
          )}
          {["Radar", "CRM"].includes(page) && (
            <section className="panel">
              <div className="section-heading">
                <h2>
                  {page === "Radar" ? "Negocios registrados" : "CRM comercial"}{" "}
                  <span className="count">{prospects.length}</span>
                </h2>
                <div className="actions">
                  <button
                    onClick={() => {
                      setCsv("");
                      setPreview(null);
                      setImportOpen(true);
                    }}
                  >
                    <Upload size={16} /> Importar CSV
                  </button>
                  <button onClick={() => run(exportContacts)} disabled={busy}>
                    <Download size={16} /> Exportar
                  </button>
                </div>
              </div>
              <div className="filters">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    aria-label="Buscar en el CRM"
                    placeholder="Buscar nombre, rubro o localidad…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filtrar por etapa"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  <option value="">Todas las etapas</option>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar presencia web"
                  value={webFilter}
                  onChange={(e) => setWebFilter(e.target.value)}
                >
                  <option value="">Presencia web</option>
                  {webStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar revisión"
                  value={reviewFilter}
                  onChange={(e) => setReviewFilter(e.target.value)}
                >
                  <option value="">Toda revisión</option>
                  {reviews.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {page === "CRM" && (
                  <div className="segmented">
                    <button
                      aria-pressed={view === "table"}
                      onClick={() => setView("table")}
                    >
                      Tabla
                    </button>
                    <button
                      aria-pressed={view === "board"}
                      onClick={() => setView("board")}
                    >
                      Tablero
                    </button>
                  </div>
                )}
              </div>
              {page === "CRM" && view === "board" ? (
                <div className="board">
                  {stages.map((s) => (
                    <div className="board-column" key={s}>
                      <h3>
                        {s}
                        <span>
                          {filtered.filter((p) => p.stage === s).length}
                        </span>
                      </h3>
                      {filtered
                        .filter((p) => p.stage === s)
                        .map((p) => (
                          <button
                            className="board-card"
                            key={p.id}
                            onClick={() => openProspect(p)}
                          >
                            <strong>{p.name}</strong>
                            <small>
                              {p.city} · {p.sector}
                            </small>
                            <ScoreTag p={p} />
                            {p.noContact && (
                              <Tag tone="danger">No contactar</Tag>
                            )}
                            <p>{p.service || "Servicio por definir"}</p>
                          </button>
                        ))}
                      {!filtered.some((p) => p.stage === s) && (
                        <p className="column-empty">Sin oportunidades</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                table
              )}
              <div className="panel-footer">
                <ShieldCheck size={15} /> Solo datos que registrás o importás.
                Ningún resultado inventado.
              </div>
            </section>
          )}
          {page === "Seguimientos" && (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <span>Vencidos</span>
                  <strong className="danger-text">{overdue.length}</strong>
                </div>
                <div className="stat">
                  <span>Para hoy</span>
                  <strong>
                    {activeTasks.filter((t) => t.due === today).length}
                  </strong>
                </div>
                <div className="stat">
                  <span>Próximos</span>
                  <strong>
                    {activeTasks.filter((t) => t.due > today).length}
                  </strong>
                </div>
              </div>
              {[
                ["Vencidos", overdue],
                ["Hoy", activeTasks.filter((t) => t.due === today)],
                ["Próximas acciones", activeTasks.filter((t) => t.due > today)],
                [
                  "Completados y pausados",
                  tasks.filter((t) => t.status !== "pending"),
                ],
              ].map(([title, list]: any) => (
                <section className="panel" key={title}>
                  <div className="section-heading">
                    <h2>{title}</h2>
                  </div>
                  {taskList(list)}
                </section>
              ))}
              <p className="muted">
                Los negocios marcados No contactar quedan fuera de los
                recordatorios activos. No hay notificaciones externas
                conectadas.
              </p>
            </>
          )}
          {page === "Resumen" && (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <span>Presupuestos abiertos</span>
                  <strong>
                    {money(
                      prospects
                        .filter((p) => !["Ganado", "Perdido"].includes(p.stage))
                        .reduce((s, p) => s + p.quotedCents, 0),
                    )}
                  </strong>
                  <small>Importes estimados, aún no son ventas.</small>
                </div>
                <div className="stat">
                  <span>Ventas ganadas</span>
                  <strong>
                    {money(
                      prospects
                        .filter((p) => p.stage === "Ganado")
                        .reduce((s, p) => s + p.wonCents, 0),
                    )}
                  </strong>
                  <small>Valor acordado, puede estar pendiente de cobro.</small>
                </div>
                <div className="stat">
                  <span>Efectivamente cobrado</span>
                  <strong className="cyan-text">
                    {money(
                      prospects.reduce(
                        (s, p) =>
                          s +
                          p.payments.reduce(
                            (a: number, b: Item) => a + b.cents,
                            0,
                          ),
                        0,
                      ),
                    )}
                  </strong>
                  <small>Solo cobros registrados manualmente.</small>
                </div>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Contactos por etapa</h2>
                </div>
                <div className="stage-summary">
                  {stages.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setStageFilter(s);
                        setPage("CRM");
                      }}
                    >
                      <span>{s}</span>
                      <strong>
                        {prospects.filter((p) => p.stage === s).length}
                      </strong>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Hoy y vencidos</h2>
                  <button onClick={() => setPage("Seguimientos")}>
                    Ver seguimientos
                  </button>
                </div>
                {taskList(activeTasks.filter((t) => t.due <= today))}
              </section>
            </>
          )}
          {page === "Configuración" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await action("settings", settings);
                  setNotice("Configuración guardada.");
                });
              }}
            >
              <section className="panel settings-panel">
                <h2>Identidad comercial</h2>
                <div className="form-grid">
                  {[
                    ["name", "Nombre"],
                    ["brand", "Marca"],
                    ["signature", "Firma comercial"],
                    ["email", "Email"],
                    ["phone", "WhatsApp"],
                    ["website", "Sitio web"],
                  ].map(([k, l]) => (
                    <Field
                      key={k}
                      label={l}
                      value={settings[k]}
                      onChange={(v: string) =>
                        setSettings({ ...settings, [k]: v })
                      }
                    />
                  ))}
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="section-heading">
                  <h2>Servicios y precios</h2>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        services: [
                          ...settings.services,
                          { name: "", price: "" },
                        ],
                      })
                    }
                  >
                    <Plus size={16} /> Agregar servicio
                  </button>
                </div>
                <p className="muted">
                  Precios en ARS. Dejá vacío lo que aún no definiste.
                </p>
                {settings.services.map((s: any, i: number) => (
                  <div className="service-row" key={i}>
                    <Field
                      label="Servicio"
                      value={s.name}
                      onChange={(v: string) =>
                        setSettings({
                          ...settings,
                          services: settings.services.map(
                            (x: any, j: number) =>
                              j === i ? { ...x, name: v } : x,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Precio ARS (opcional)"
                      value={s.price}
                      onChange={(v: string) =>
                        setSettings({
                          ...settings,
                          services: settings.services.map(
                            (x: any, j: number) =>
                              j === i ? { ...x, price: v } : x,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={"Quitar servicio " + s.name}
                      className="icon-button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          services: settings.services.filter(
                            (_: any, j: number) => i !== j,
                          ),
                        })
                      }
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </section>
              <section className="panel settings-panel">
                <h2>Plantillas de mensajes</h2>
                <p className="muted">
                  Variables disponibles:{" "}
                  {"{firma}, {negocio}, {servicio}, {presupuesto}"}. Revisá
                  siempre el borrador. Estas plantillas no usan IA.
                </p>
                {messageTypes.map((t) => (
                  <Field
                    key={t}
                    label={t}
                    type="textarea"
                    value={settings.templates[t]}
                    onChange={(v: string) =>
                      setSettings({
                        ...settings,
                        templates: { ...settings.templates, [t]: v },
                      })
                    }
                  />
                ))}
              </section>
              <section className="panel settings-panel">
                <h2>Integraciones</h2>
                <div className="integration-row">
                  <span>Búsqueda automática</span>
                  <Tag>Pendiente de conexión</Tag>
                </div>
                <div className="integration-row">
                  <span>Mensajes</span>
                  <Tag tone="purple">Plantillas · sin IA</Tag>
                </div>
                <div className="integration-row">
                  <span>Auditoría web</span>
                  <Tag>No conectada</Tag>
                </div>
                <div className="integration-row">
                  <span>Notificaciones externas</span>
                  <Tag>No conectadas</Tag>
                </div>
                <div className="integration-row">
                  <span>Persistencia</span>
                  <Tag tone="cyan">{snapshot.storage}</Tag>
                </div>
                <p className="muted">
                  No se envían datos a proveedores de IA. Los buscadores
                  externos reciben únicamente los términos al abrir sus enlaces.
                </p>
              </section>
              <button className="primary" disabled={busy}>
                Guardar configuración
              </button>
            </form>
          )}
        </main>
        <footer>
          2bleA Radar{" "}
          <span>Prospección con criterio · Sin envíos automáticos</span>
        </footer>
      </div>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? edit.name : "Registrar un negocio"}
        description="Información registrada por vos. Los cambios de la ficha se aplican al guardar."
      >
        {edit && (
          <>
            <div className="detail-tabs">
              {[
                "Ficha",
                "Evaluación",
                "Mensajes",
                "Seguimientos",
                "Historial y cobros",
              ].map((t) => (
                <button
                  key={t}
                  className={detailTab === t ? "active" : ""}
                  disabled={!edit.id && !["Ficha", "Evaluación"].includes(t)}
                  onClick={() => {
                    if (
                      edit.id &&
                      [
                        "Mensajes",
                        "Seguimientos",
                        "Historial y cobros",
                      ].includes(t) &&
                      JSON.stringify(fields.map((k) => edit[k])) !==
                        JSON.stringify(fields.map((k) => current?.[k]))
                    ) {
                      setError(
                        "Guardá o descartá los cambios de la ficha antes de continuar.",
                      );
                      return;
                    }
                    setDetailTab(t);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {(current?.noContact || edit.noContact) && (
              <div className="banner danger">
                <Ban size={18} /> No contactar. Los mensajes y seguimientos
                están bloqueados
                {edit.noContact !== current?.noContact
                  ? " al guardar este cambio"
                  : ""}
                .
              </div>
            )}
            {["Ficha", "Evaluación"].includes(detailTab) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => saveProspect());
                }}
              >
                {detailTab === "Ficha" ? (
                  <>
                    <h3>El negocio</h3>
                    <div className="form-grid">
                      <Field
                        label="Nombre comercial"
                        value={edit.name}
                        onChange={(v: string) => change("name", v)}
                        required
                      />
                      <Field
                        label="Rubro"
                        value={edit.sector}
                        onChange={(v: string) => change("sector", v)}
                        list="sectors"
                      />
                      <datalist id="sectors">
                        {sectors.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </datalist>
                      <Field
                        label="Localidad o zona"
                        value={edit.city}
                        onChange={(v: string) => change("city", v)}
                        required
                      />
                      <Field
                        label="Persona de contacto"
                        value={edit.contactPerson}
                        onChange={(v: string) => change("contactPerson", v)}
                      />
                      <Field
                        label="Sitio web"
                        type="url"
                        value={edit.website}
                        onChange={(v: string) => change("website", v)}
                        placeholder="https://…"
                      />
                      <Field
                        label="Red social (URL)"
                        type="url"
                        value={edit.social}
                        onChange={(v: string) => change("social", v)}
                        placeholder="https://instagram.com/…"
                      />
                      <Field
                        label="Teléfono comercial público"
                        type="tel"
                        value={edit.phone}
                        onChange={(v: string) => change("phone", v)}
                        placeholder="+54 9 …"
                      />
                      <Field
                        label="Email comercial público"
                        type="email"
                        value={edit.email}
                        onChange={(v: string) => change("email", v)}
                      />
                    </div>
                    <h3>Fuente y revisión</h3>
                    <div className="form-grid">
                      <Field
                        label="Enlace de origen"
                        type="url"
                        value={edit.source}
                        onChange={(v: string) => change("source", v)}
                      />
                      <Field
                        label="Fecha de consulta"
                        type="date"
                        max={today}
                        value={edit.consultedAt}
                        onChange={(v: string) => change("consultedAt", v)}
                      />
                      <Field
                        label="Estado de revisión"
                        value={edit.review}
                        onChange={(v: string) => change("review", v)}
                        options={reviews}
                      />
                      <Field
                        label="Fecha de verificación"
                        type="date"
                        max={today}
                        value={edit.verifiedAt}
                        onChange={(v: string) => change("verifiedAt", v)}
                      />
                      <Field
                        label="Presencia web"
                        value={edit.webStatus}
                        onChange={(v: string) => change("webStatus", v)}
                        options={webStates}
                      />
                      <Field
                        label="Oportunidad observada"
                        type="textarea"
                        value={edit.opportunity}
                        onChange={(v: string) => change("opportunity", v)}
                        placeholder="Qué viste, dónde y por qué podría servir una solución."
                      />
                      <Field
                        label="Observaciones"
                        type="textarea"
                        wide
                        value={edit.notes}
                        onChange={(v: string) => change("notes", v)}
                      />
                    </div>
                    <p className="hint">
                      “No encontrada” no confirma ausencia. Para marcar
                      “Ausencia confirmada”, agregá la evidencia en Evaluación.
                    </p>
                    <h3>Proceso comercial</h3>
                    <div className="form-grid">
                      <Field
                        label="Servicio propuesto"
                        value={edit.service}
                        onChange={(v: string) => change("service", v)}
                        list="services"
                      />
                      <datalist id="services">
                        {state.settings.services.map((s: any) => (
                          <option key={s.name}>{s.name}</option>
                        ))}
                      </datalist>
                      <Field
                        label="Etapa comercial"
                        value={edit.stage}
                        onChange={(v: string) => {
                          change("stage", v);
                          if (v !== "Ganado") change("wonCents", 0);
                        }}
                        options={stages}
                      />
                      <Field
                        label="Importe presupuestado (ARS)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={edit.quotedCents / 100}
                        onChange={(v: string) =>
                          change("quotedCents", inputMoney(v))
                        }
                      />
                      <Field
                        label="Venta ganada (ARS)"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={edit.stage !== "Ganado"}
                        value={edit.wonCents / 100}
                        onChange={(v: string) =>
                          change("wonCents", inputMoney(v))
                        }
                      />
                    </div>
                    <p className="hint">
                      Los cobros efectivos se registran por separado en
                      Historial y cobros.
                    </p>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={edit.noContact}
                        onChange={(e) => change("noContact", e.target.checked)}
                      />
                      <strong>No contactar</strong>
                      <span>
                        Pausa las tareas de contacto pendientes al guardar.
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="score-heading">
                      <div>
                        <h3>Prioridad comercial</h3>
                        <p>
                          {score(edit).insufficient
                            ? "Información insuficiente: revisá al menos dos criterios."
                            : "Puntuación orientativa basada en evidencia registrada."}
                        </p>
                      </div>
                      <strong>
                        {score(edit).insufficient ? "—" : score(edit).value}
                        <small>/ 100</small>
                      </strong>
                    </div>
                    <p className="banner">
                      Mide prioridad comercial, no intención de compra ni
                      probabilidad garantizada de cierre. Lo desconocido no suma
                      puntos.
                    </p>
                    {criteria.map(([k, l, w]) => (
                      <div className="criterion" key={k}>
                        <div className="criterion-heading">
                          <strong>{l}</strong>
                          <Tag>
                            {
                              score(edit).breakdown.find((c) => c.key === k)
                                ?.points
                            }{" "}
                            / {w}
                          </Tag>
                        </div>
                        <div className="form-grid">
                          <Field
                            label="Estado de la señal"
                            options={["unknown", "yes", "no"]}
                            value={edit.signals?.[k]?.value || "unknown"}
                            onChange={(v: string) =>
                              change("signals", {
                                ...edit.signals,
                                [k]: {
                                  value: v,
                                  evidence: edit.signals?.[k]?.evidence || "",
                                },
                              })
                            }
                          />
                          <Field
                            label="Evidencia verificable"
                            type="textarea"
                            value={edit.signals?.[k]?.evidence || ""}
                            onChange={(v: string) =>
                              change("signals", {
                                ...edit.signals,
                                [k]: {
                                  value: edit.signals?.[k]?.value || "unknown",
                                  evidence: v,
                                },
                              })
                            }
                          />
                        </div>
                        <p className="hint">
                          Para sumar, completá fuente y fecha de verificación en
                          la ficha.
                        </p>
                      </div>
                    ))}
                  </>
                )}
                <div className="form-footer">
                  <button type="button" onClick={() => setEdit(null)}>
                    Cancelar
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Guardando…" : "Guardar prospecto"}
                  </button>
                </div>
              </form>
            )}
            {detailTab === "Mensajes" && current && (
              <>
                <div className="banner">
                  Plantillas editables, sin IA. Se usan los datos guardados de
                  la ficha. Revisá el texto antes de copiarlo o abrir un canal;
                  nada se envía automáticamente.
                </div>
                <div className="form-grid">
                  <Field
                    label="Tipo de mensaje"
                    options={messageTypes}
                    value={messageType}
                    onChange={setMessageType}
                  />
                  <Field
                    label="Canal"
                    options={["WhatsApp", "Instagram", "Email"]}
                    value={channel}
                    onChange={setChannel}
                  />
                </div>
                <button
                  disabled={busy || current.noContact}
                  onClick={() =>
                    run(async () => {
                      setDraft(
                        renderMessage(current, state.settings, messageType),
                      );
                      setDraftId(undefined);
                    })
                  }
                >
                  Preparar borrador
                </button>
                <Field
                  label="Borrador editable"
                  type="textarea"
                  rows={7}
                  value={draft}
                  onChange={setDraft}
                  disabled={current.noContact}
                />
                <div className="actions wrap">
                  <button
                    className="primary"
                    disabled={busy || current.noContact || !draft.trim()}
                    onClick={() =>
                      run(async () => {
                        const r = await action("draft", {
                          id: draftId,
                          prospectId: current.id,
                          channel,
                          type: messageType,
                          text: draft,
                        });
                        setDraftId(r.id);
                        setNotice("Borrador guardado.");
                      })
                    }
                  >
                    Guardar borrador
                  </button>
                  <button
                    disabled={busy || current.noContact || !draft.trim()}
                    onClick={() =>
                      run(async () => {
                        await action("contactAction", {
                          id: current.id,
                          channel: "copy",
                        });
                        try {
                          await navigator.clipboard.writeText(draft);
                          setNotice("Mensaje copiado.");
                        } catch {
                          throw new Error(
                            "No se pudo copiar. Seleccioná el borrador y copialo manualmente.",
                          );
                        }
                      })
                    }
                  >
                    <Copy size={16} /> Copiar
                  </button>
                  <button
                    disabled={busy || current.noContact}
                    onClick={() =>
                      run(async () => {
                        const r = await action("contactAction", {
                          id: current.id,
                          channel,
                        });
                        window.location.assign(r.url);
                      })
                    }
                  >
                    Abrir {channel} <ArrowUpRight size={16} />
                  </button>
                </div>
                <h3>Borradores guardados</h3>
                {drafts
                  .filter((d) => d.prospectId === current.id)
                  .map((d) => (
                    <button
                      key={d.id}
                      disabled={current.noContact}
                      className="draft-row"
                      onClick={() => {
                        setDraft(d.text);
                        setDraftId(d.id);
                        setChannel(d.channel);
                        setMessageType(d.type);
                      }}
                    >
                      <span>
                        {d.type} · {d.channel}
                      </span>
                      <small>{timestamp(d.updatedAt)}</small>
                    </button>
                  ))}
                {!drafts.some((d) => d.prospectId === current.id) && (
                  <p className="muted">Todavía no guardaste borradores.</p>
                )}
              </>
            )}
            {detailTab === "Seguimientos" && current && (
              <>
                <h3>
                  {taskEdit ? "Reprogramar seguimiento" : "Nuevo seguimiento"}
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await action("task", {
                        id: taskEdit?.id,
                        prospectId: current.id,
                        title: taskTitle,
                        due: taskDue,
                        status: "pending",
                      });
                      setTaskEdit(null);
                      setTaskTitle("Volver a contactar");
                      setNotice("Seguimiento guardado.");
                    });
                  }}
                >
                  <div className="form-grid">
                    <Field
                      label="Acción pendiente"
                      value={taskTitle}
                      onChange={setTaskTitle}
                      required
                      disabled={current.noContact}
                    />
                    <Field
                      label="Fecha de seguimiento"
                      type="date"
                      value={taskDue}
                      onChange={setTaskDue}
                      required
                      disabled={current.noContact}
                    />
                  </div>
                  <button
                    className="primary"
                    disabled={busy || current.noContact}
                  >
                    Guardar seguimiento
                  </button>
                </form>
                <h3>Tareas de este negocio</h3>
                {taskList(tasks.filter((t) => t.prospectId === current.id))}
              </>
            )}
            {detailTab === "Historial y cobros" && current && (
              <>
                <h3>Registrar actividad</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await action("activity", {
                        id: current.id,
                        kind: noteKind,
                        text: note,
                      });
                      setNote("");
                      setNotice("Actividad registrada.");
                    });
                  }}
                >
                  <Field
                    label="Tipo de actividad"
                    value={noteKind}
                    onChange={setNoteKind}
                    options={["note", "contact", "response"]}
                  />
                  <p className="hint">
                    Registrar un contacto pasa el negocio a Contactado; una
                    respuesta recibida, a Respondió.
                  </p>
                  <Field
                    label="Detalle de la actividad"
                    type="textarea"
                    value={note}
                    onChange={setNote}
                    required
                  />
                  <button
                    disabled={
                      busy || (current.noContact && noteKind === "contact")
                    }
                    className="primary"
                  >
                    Registrar actividad
                  </button>
                </form>
                <h3>
                  {paymentId ? "Corregir cobro" : "Registrar cobro efectivo"}
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await action("payment", {
                        id: current.id,
                        paymentId,
                        cents: inputMoney(payment),
                        date: paymentDate,
                        note: paymentNote,
                      });
                      setPayment("");
                      setPaymentId(undefined);
                      setPaymentNote("");
                      setNotice("Cobro guardado.");
                    });
                  }}
                >
                  <div className="form-grid">
                    <Field
                      label="Importe cobrado (ARS)"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={payment}
                      onChange={setPayment}
                      required
                    />
                    <Field
                      label="Fecha del cobro"
                      type="date"
                      max={today}
                      value={paymentDate}
                      onChange={setPaymentDate}
                      required
                    />
                    <Field
                      label="Referencia u observación del cobro"
                      value={paymentNote}
                      onChange={setPaymentNote}
                      wide
                    />
                  </div>
                  <button disabled={busy}>Guardar cobro</button>
                </form>
                <div className="payment-list">
                  {current.payments.map((p: Item) => (
                    <div key={p.id}>
                      <strong>{money(p.cents)}</strong>
                      <span>
                        {dateLabel(p.date)} · {p.note}
                      </span>
                      <button
                        onClick={() => {
                          setPayment(String(p.cents / 100));
                          setPaymentDate(p.date);
                          setPaymentNote(p.note);
                          setPaymentId(p.id);
                        }}
                      >
                        Corregir
                      </button>
                    </div>
                  ))}
                </div>
                <h3>Posibles duplicados</h3>
                {duplicates(current, prospects).length ? (
                  duplicates(current, prospects).map((p: any) => (
                    <div className="duplicate-row" key={p.id}>
                      <span>
                        {p.name} · {p.city}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Fusionar " +
                                p.name +
                                " en esta ficha? Se conservarán los campos principales de esta ficha, las actividades, tareas y cobros de ambas. Los campos de la otra ficha quedarán como copia en el historial. No contactar prevalece. Los presupuestos no se suman.",
                            )
                          )
                            run(async () => {
                              await action("merge", {
                                keepId: current.id,
                                removeId: p.id,
                              });
                              setNotice("Fichas fusionadas.");
                            });
                        }}
                      >
                        Revisar y fusionar
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Sin coincidencias por dominio, teléfono o nombre y
                    localidad.
                  </p>
                )}
                <h3>Historial de actividad</h3>
                <ol className="timeline">
                  {current.activities.map((a: Item) => (
                    <li key={a.id}>
                      <small>{timestamp(a.at)}</small>
                      <p>{a.text}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar contactos"
        description="Revisá las filas antes de confirmar. No se importan duplicados ni filas inválidas."
      >
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="banner">
          CSV de hasta 500 filas y 2 MB. Columnas obligatorias: nombre y
          localidad. Las fechas usan AAAA-MM-DD; los importes, decimales sin
          separador de miles.
        </div>
        <div className="actions wrap">
          <button
            onClick={() =>
              download(
                "plantilla-radar.csv",
                "\uFEFF" + csvFields.map(csvSafe).join(";") + "\r\n",
              )
            }
          >
            Descargar plantilla
          </button>
          <button onClick={() => fileInput.current?.click()}>
            Seleccionar CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            aria-label="Archivo CSV"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                run(async () => {
                  if (file.size > 2_000_000)
                    throw new Error("El archivo supera los 2 MB.");
                  setCsv(await file.text());
                  setPreview(null);
                });
              e.target.value = "";
            }}
          />
        </div>
        <Field
          label="Contenido CSV"
          type="textarea"
          rows={5}
          value={csv}
          onChange={(v: string) => {
            setCsv(v);
            setPreview(null);
          }}
        />
        <button
          className="primary"
          disabled={busy || !csv}
          onClick={() =>
            run(async () => {
              const data = await api("/import/preview", { csv });
              setPreview(data);
              setSelectedRows(
                data.rows
                  .filter((r: any) => !r.error && !r.duplicates.length)
                  .map((r: any) => r.line),
              );
            })
          }
        >
          Validar y ver vista previa
        </button>
        {preview && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Importar</th>
                    <th>Fila</th>
                    <th>Negocio</th>
                    <th>Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r: any) => (
                    <tr key={r.line}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"Importar fila " + r.line}
                          disabled={!!r.error || !!r.duplicates.length}
                          checked={selectedRows.includes(r.line)}
                          onChange={(e) =>
                            setSelectedRows(
                              e.target.checked
                                ? [...selectedRows, r.line]
                                : selectedRows.filter((n) => n !== r.line),
                            )
                          }
                        />
                      </td>
                      <td>{r.line}</td>
                      <td>
                        {r.prospect?.name || "—"}
                        <small>{r.prospect?.city}</small>
                      </td>
                      <td>
                        {r.error ? (
                          <span className="danger-text">{r.error}</span>
                        ) : r.duplicates.length ? (
                          "Duplicado: " +
                          r.duplicates.map((p: any) => p.name).join(", ")
                        ) : (
                          "Lista para importar"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Las coincidencias se excluyen. Revisalas en CRM antes de fusionar
              o registrar un negocio distinto.
            </p>
            <button
              className="primary"
              disabled={busy || !selectedRows.length}
              onClick={() =>
                run(async () => {
                  if (
                    !window.confirm(
                      "¿Importar " +
                        selectedRows.length +
                        " contactos seleccionados?",
                    )
                  )
                    return;
                  const r = await action(
                    "import",
                    { csv, lines: selectedRows },
                    preview.version,
                  );
                  setImportOpen(false);
                  setNotice(r.count + " contactos importados.");
                })
              }
            >
              Confirmar importación ({selectedRows.length})
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}
