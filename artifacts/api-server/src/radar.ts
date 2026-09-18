import { Router, type Request, type Response } from "express";
import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { RadarStore } from "@workspace/db/radar-store";
import {
  initialState,
  stages,
  webStates,
  reviews,
  criteria,
  messageTypes,
  duplicates,
  score,
  renderMessage,
  exportCSV,
  parseCSV,
  csvToProspect,
  argentinaToday,
} from "../../../shared/radar.mjs";

const str = (max = 500) => z.string().trim().max(max);
const short = str(160);
const url = str(1500).refine(
  (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
  "Usá un enlace http o https completo.",
);
const date = str(10).refine(
  (v) =>
    !v ||
    (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v),
  "Fecha inválida.",
);
const amount = z.number().int().min(0).max(100_000_000_000);
const signals = z
  .record(
    z.object({ value: z.enum(["unknown", "yes", "no"]), evidence: str(1500) }),
  )
  .refine(
    (v) => Object.keys(v).every((k) => criteria.some((c) => c[0] === k)),
    "Criterio desconocido.",
  );
const prospect = z
  .object({
    name: short.min(1, "Ingresá el nombre."),
    sector: short.min(1),
    city: short.min(1, "Ingresá la localidad."),
    website: url.default(""),
    social: url.default(""),
    phone: str(60).default(""),
    email: str(254)
      .refine(
        (v) => !v || z.string().email().safeParse(v).success,
        "Email inválido.",
      )
      .default(""),
    source: url.default(""),
    consultedAt: date.default(""),
    verifiedAt: date.default(""),
    review: z.enum(reviews as [string, ...string[]]).default("Pendiente"),
    webStatus: z.enum(webStates as [string, ...string[]]).default("Pendiente"),
    contactPerson: short.default(""),
    notes: str(10000).default(""),
    opportunity: str(3000).default(""),
    service: short.default(""),
    quotedCents: amount.default(0),
    wonCents: amount.default(0),
    stage: z.enum(stages as [string, ...string[]]).default("Nuevo"),
    noContact: z.boolean().default(false),
    signals: signals.default({}),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.review === "Verificada" && (!p.source || !p.verifiedAt))
      ctx.addIssue({
        code: "custom",
        message: "Para verificar, registrá fuente y fecha de verificación.",
      });
    if (p.webStatus === "Web encontrada" && !p.website)
      ctx.addIssue({
        code: "custom",
        message: "Ingresá el sitio web encontrado.",
      });
    if (
      p.webStatus === "Ausencia confirmada" &&
      (!p.source ||
        !p.verifiedAt ||
        !p.signals.noWeb?.evidence ||
        p.signals.noWeb.value !== "yes")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "La ausencia confirmada requiere fuente, fecha y evidencia manual en la evaluación.",
      });
    if (p.website && p.webStatus === "Ausencia confirmada")
      ctx.addIssue({
        code: "custom",
        message: "La web registrada contradice la ausencia confirmada.",
      });
    if (p.stage !== "Ganado" && p.wonCents > 0)
      ctx.addIssue({
        code: "custom",
        message: "El valor de venta ganada requiere la etapa Ganado.",
      });
    if (p.stage === "Ganado" && p.wonCents === 0)
      ctx.addIssue({
        code: "custom",
        message: "Ingresá el valor acordado de la venta ganada.",
      });
    if ([p.consultedAt, p.verifiedAt].some((d) => d && d > argentinaToday()))
      ctx.addIssue({
        code: "custom",
        message: "La consulta o verificación no puede tener una fecha futura.",
      });
    for (const [key, s] of Object.entries(p.signals))
      if (s.value === "yes") {
        if (!s.evidence || !p.source || !p.verifiedAt)
          ctx.addIssue({
            code: "custom",
            message:
              "Cada señal positiva requiere evidencia, fuente y fecha de verificación.",
          });
        if (key === "noWeb" && p.webStatus !== "Ausencia confirmada")
          ctx.addIssue({
            code: "custom",
            message:
              "Confirmá manualmente la ausencia de web antes de sumar esta señal.",
          });
        if (key === "webIssues" && !p.website)
          ctx.addIssue({
            code: "custom",
            message: "Registrá la web donde comprobaste los problemas.",
          });
        if (key === "publicChannel" && !(p.phone || p.email || p.social))
          ctx.addIssue({
            code: "custom",
            message: "Registrá el canal comercial público.",
          });
      }
  });
const settingsSchema = z
  .object({
    name: short.min(1),
    brand: short.min(1),
    signature: short.min(1),
    email: str(254).email(),
    phone: str(60),
    website: url,
    services: z
      .array(
        z.object({
          name: short.min(1),
          price: str(30).refine(
            (v) => !v || /^\d+(?:[.,]\d{1,2})?$/.test(v),
            "Precio inválido.",
          ),
        }),
      )
      .max(30),
    templates: z
      .record(str(5000).min(1))
      .refine(
        (v) => messageTypes.every((k) => Boolean(v[k])),
        "Completá las cuatro plantillas.",
      ),
  })
  .strict();
const fail = (message: string, status = 400, details?: any) => {
  throw Object.assign(new Error(message), { status, details });
};
const safeCSV = (csv: string) => {
  try {
    return parseCSV(csv);
  } catch (e) {
    return fail((e as Error).message);
  }
};
const now = () => new Date().toISOString();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const passwordHash = () => process.env.RADAR_PASSWORD_HASH || "";
const configured = () => /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash());
const verifyPassword = (password: string) => {
  if (!configured()) return false;
  const [salt, key] = passwordHash().split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(key, "hex"),
  );
};
const sessionKey = (token: string) => hash(token + ":" + passwordHash());
const sessionCookie = (req: Request) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("radar_session="))
    ?.slice(14) || "";
const contactable = (p: any) => {
  if (p.noContact)
    fail("No contactar: las acciones de contacto están bloqueadas.", 403);
};
const findProspect = (state: any, id: string) =>
  state.prospects.find((p: any) => p.id === id) ||
  fail("El negocio no existe.", 404);
const activity = (p: any, kind: string, text: string) => {
  p.updatedAt = now();
  p.activities.unshift({ id: randomUUID(), at: now(), kind, text });
};
let store: RadarStore | undefined;
export const router = Router();
const storage = async () => {
  store ??= new RadarStore();
  await store.init(initialState());
  return store;
};

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const expected = process.env.APP_ORIGIN;
    if (!expected)
      return res
        .status(503)
        .json({ error: "Falta configurar APP_ORIGIN en el servidor." });
    if (
      req.headers.origin !== expected ||
      req.headers["x-radar-request"] !== "1" ||
      !req.is("application/json")
    )
      return res
        .status(403)
        .json({
          error:
            "Solicitud no autorizada. Recargá la página desde la dirección configurada.",
        });
  }
  next();
  return;
});
router.get("/session", async (req, res) => {
  if (!configured())
    return res
      .status(503)
      .json({
        error:
          "Acceso cerrado: falta configurar la contraseña del propietario.",
        configured: false,
      });
  const db = await storage();
  const rows = await db.query(
    "SELECT token FROM radar_sessions WHERE token=$1 AND expires>$2",
    [sessionKey(sessionCookie(req)), Date.now()],
  );
  return res.json({ authenticated: rows.length > 0, configured: true });
});
router.post("/login", async (req, res) => {
  if (!configured())
    return res
      .status(503)
      .json({
        error:
          "Acceso cerrado: falta configurar la contraseña del propietario.",
      });
  const body = z
    .object({ password: z.string().min(1).max(256) })
    .strict()
    .parse(req.body);
  const db = await storage();
  // A database-backed global limit cannot be bypassed with spoofed proxy/IP headers.
  await db.query(
    "INSERT INTO radar_auth_limits (id,attempts,until_at) VALUES ($1,0,0) ON CONFLICT (id) DO NOTHING",
    ["owner"],
  );
  await db.query(
    "UPDATE radar_auth_limits SET attempts=0,until_at=$1 WHERE id=$2 AND until_at<$3",
    [Date.now() + 900000, "owner", Date.now()],
  );
  const attempts = await db.query(
    "UPDATE radar_auth_limits SET attempts=attempts+1 WHERE id=$1 AND attempts<10 RETURNING attempts",
    ["owner"],
  );
  if (!attempts.length) {
    res.setHeader("Retry-After", "900");
    return res
      .status(429)
      .json({ error: "Demasiados intentos. Esperá 15 minutos." });
  }
  if (!verifyPassword(body.password))
    return res.status(401).json({ error: "Contraseña incorrecta." });
  await db.query("UPDATE radar_auth_limits SET attempts=0 WHERE id=$1", [
    "owner",
  ]);
  await db.query("DELETE FROM radar_sessions WHERE expires<$1", [Date.now()]);
  const token = randomBytes(32).toString("hex");
  await db.query("INSERT INTO radar_sessions (token,expires) VALUES ($1,$2)", [
    sessionKey(token),
    Date.now() + 43200000,
  ]);
  res.cookie("radar_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 43200000,
    path: "/",
  });
  return res.json({ ok: true });
});
router.use(async (req, res, next) => {
  if (!configured())
    return res
      .status(503)
      .json({
        error:
          "Acceso cerrado: falta configurar la contraseña del propietario.",
      });
  const db = await storage();
  const session = await db.query(
    "SELECT token FROM radar_sessions WHERE token=$1 AND expires>$2",
    [sessionKey(sessionCookie(req)), Date.now()],
  );
  if (!session.length)
    return res.status(401).json({ error: "Iniciá sesión para acceder." });
  next();
  return;
});
router.post("/logout", async (req, res) => {
  await (
    await storage()
  ).query("DELETE FROM radar_sessions WHERE token=$1", [
    sessionKey(sessionCookie(req)),
  ]);
  res.clearCookie("radar_session", { path: "/" });
  res.json({ ok: true });
});
router.get("/state", async (_req, res) => {
  const db = await storage();
  const snapshot = await db.read();
  res.json({
    ...snapshot,
    storage: db.mode,
    integrations: {
      search: "assisted",
      ai: "templates",
      audit: false,
      externalNotifications: false,
    },
  });
});
router.get("/export", async (_req, res) => {
  const { state } = await (await storage()).read();
  res
    .type("text/csv; charset=utf-8")
    .attachment("2blea-radar-contactos.csv")
    .send(exportCSV(state.prospects));
});
router.post("/import/preview", async (req, res) => {
  const { csv } = z
    .object({ csv: z.string().max(2_000_000) })
    .strict()
    .parse(req.body);
  const { state, version } = await (await storage()).read();
  const seen = [...state.prospects];
  let parsedRows: any[];
  try {
    parsedRows = safeCSV(csv);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  const rows = parsedRows.map((row) => {
    try {
      if (row.error) throw new Error(row.error);
      const p = prospect.parse(csvToProspect(row.values));
      const matches = duplicates(p, seen).map((d: any) => ({
        id: d.id,
        name: d.name,
        city: d.city,
      }));
      seen.push({ ...p, id: "fila-" + row.line });
      return { line: row.line, prospect: p, duplicates: matches, error: null };
    } catch (e) {
      return {
        line: row.line,
        error:
          e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join(" ")
            : String((e as Error).message),
        duplicates: [],
      };
    }
  });
  return res.json({ rows, version });
});
router.post("/action", async (req, res) => {
  const { version, type, payload } = z
    .object({
      version: z.number().int().nonnegative(),
      type: str(40),
      payload: z.any(),
    })
    .strict()
    .parse(req.body);
  const db = await storage();
  const snapshot = await db.read();
  if (snapshot.version !== version)
    fail("Los datos cambiaron. Recargá y revisá antes de guardar.", 409);
  const state = snapshot.state;
  let result: any = {};
  if (type === "saveProspect") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        data: z.unknown(),
        allowDuplicate: z.boolean().optional(),
      })
      .strict()
      .parse(payload);
    const p = prospect.parse(input.data);
    if (
      p.noContact &&
      !input.id &&
      ["Contactado", "Respondió", "Reunión", "Presupuesto enviado"].includes(
        p.stage,
      )
    )
      fail("No contactar bloquea las etapas de contacto.", 403);
    const old = input.id ? findProspect(state, input.id) : null;
    const matches = duplicates({ ...p, id: input.id }, state.prospects);
    if (matches.length && !input.allowDuplicate)
      fail(
        "Posibles duplicados: revisá antes de guardar como un negocio distinto.",
        409,
        matches.map((d: any) => ({ id: d.id, name: d.name, city: d.city })),
      );
    if (!old && state.prospects.length >= 5000)
      fail("Límite de 5.000 contactos alcanzado.");
    if (old) {
      const stageChanged = old.stage !== p.stage;
      if (
        (old.noContact || p.noContact) &&
        stageChanged &&
        ["Contactado", "Respondió", "Reunión", "Presupuesto enviado"].includes(
          p.stage,
        )
      )
        fail(
          "Quitá No contactar y guardá antes de registrar una etapa de contacto.",
          403,
        );
      Object.assign(old, p);
      activity(
        old,
        stageChanged ? "stage" : "edit",
        stageChanged ? "Etapa: " + p.stage : "Ficha actualizada",
      );
      if (p.noContact) {
        state.tasks
          .filter((t: any) => t.prospectId === old.id && t.status === "pending")
          .forEach((t: any) => {
            t.status = "paused";
          });
        activity(
          old,
          "privacy",
          "No contactar activado; seguimientos pendientes pausados.",
        );
      }
      result = { id: old.id };
    } else {
      const created = {
        ...p,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
        activities: [],
        payments: [],
      };
      activity(created, "create", "Prospecto registrado");
      state.prospects.push(created);
      result = { id: created.id };
    }
  } else if (type === "stage") {
    const { id, stage, wonCents } = z
      .object({
        id: z.string().uuid(),
        stage: z.enum(stages as [string, ...string[]]),
        wonCents: amount.optional(),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, id);
    if (
      ["Contactado", "Respondió", "Reunión", "Presupuesto enviado"].includes(
        stage,
      )
    )
      contactable(p);
    if (stage === "Ganado" && !(wonCents || p.wonCents))
      fail("Ingresá el valor de la venta ganada en la ficha.");
    p.stage = stage;
    p.wonCents = stage === "Ganado" ? wonCents || p.wonCents : 0;
    activity(p, "stage", "Etapa: " + stage);
  } else if (type === "activity") {
    const { id, kind, text } = z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["note", "contact", "response"]),
        text: str(3000).min(1),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, id);
    if (kind === "contact") contactable(p);
    activity(p, kind, text);
    if (kind === "contact") p.stage = "Contactado";
    if (kind === "response") p.stage = "Respondió";
  } else if (type === "task") {
    const t = z
      .object({
        id: z.string().uuid().optional(),
        prospectId: z.string().uuid(),
        title: short.min(1),
        due: date.refine(Boolean),
        status: z.enum(["pending", "done", "paused"]),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, t.prospectId);
    if (t.status !== "paused") contactable(p);
    if (t.id) {
      const old =
        state.tasks.find((v: any) => v.id === t.id && v.prospectId === p.id) ||
        fail("La tarea no existe.", 404);
      Object.assign(old, t, {
        completedAt: t.status === "done" ? now() : null,
      });
      activity(
        p,
        "task",
        t.status === "done"
          ? "Seguimiento completado: " + t.title
          : "Seguimiento actualizado: " + t.title + " · " + t.due,
      );
    } else {
      state.tasks.push({ ...t, id: randomUUID(), createdAt: now() });
      activity(p, "task", "Seguimiento creado: " + t.title + " · " + t.due);
    }
  } else if (type === "draft") {
    const d = z
      .object({
        id: z.string().uuid().optional(),
        prospectId: z.string().uuid(),
        channel: z.enum(["WhatsApp", "Instagram", "Email"]),
        type: z.enum(messageTypes as [string, ...string[]]),
        text: str(5000).optional(),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, d.prospectId);
    contactable(p);
    let text = d.text;
    try {
      text ??= renderMessage(p, state.settings, d.type);
    } catch (e) {
      fail((e as Error).message);
    }
    if (!text?.trim()) fail("El borrador está vacío.");
    if (d.id) {
      const old =
        state.drafts.find((v: any) => v.id === d.id && v.prospectId === p.id) ||
        fail("El borrador no existe.", 404);
      Object.assign(old, d, { text, updatedAt: now() });
      result = { id: old.id };
    } else {
      const draft = { ...d, text, id: randomUUID(), updatedAt: now() };
      state.drafts.unshift(draft);
      result = { id: draft.id };
    }
    activity(p, "draft", "Borrador guardado · " + d.channel + " · " + d.type);
  } else if (type === "contactAction") {
    const { id, channel } = z
      .object({
        id: z.string().uuid(),
        channel: z.enum(["copy", "WhatsApp", "Instagram", "Email"]),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, id);
    contactable(p);
    let url = "";
    if (channel === "WhatsApp") {
      const phone = p.phone.replace(/\D/g, "");
      if (!/^\d{10,15}$/.test(phone))
        fail("Registrá un teléfono comercial válido con código de país.");
      url = "https://wa.me/" + phone;
    }
    if (channel === "Instagram") {
      if (!/^https:\/\/(www\.)?instagram\.com\//i.test(p.social))
        fail("Registrá un enlace de Instagram válido.");
      url = p.social;
    }
    if (channel === "Email") {
      if (!p.email) fail("Registrá el email comercial.");
      url = "mailto:" + p.email;
    }
    return res.json({ version: snapshot.version, url });
  } else if (type === "payment") {
    const {
      id,
      paymentId,
      cents,
      date: paymentDate,
      note,
    } = z
      .object({
        id: z.string().uuid(),
        paymentId: z.string().uuid().optional(),
        cents: amount.positive(),
        date: date.refine(Boolean),
        note: str(500),
      })
      .strict()
      .parse(payload);
    const p = findProspect(state, id);
    if (paymentDate > argentinaToday())
      fail("Un cobro efectivo no puede tener fecha futura.");
    if (paymentId) {
      const payment =
        p.payments.find((v: any) => v.id === paymentId) ||
        fail("Cobro inexistente.", 404);
      Object.assign(payment, { cents, date: paymentDate, note });
    } else
      p.payments.push({ id: randomUUID(), cents, date: paymentDate, note });
    activity(
      p,
      "payment",
      "Cobro " +
        (paymentId ? "corregido" : "registrado") +
        ": ARS " +
        (cents / 100).toFixed(2),
    );
  } else if (type === "settings")
    state.settings = settingsSchema.parse(payload);
  else if (type === "merge") {
    const { keepId, removeId } = z
      .object({ keepId: z.string().uuid(), removeId: z.string().uuid() })
      .strict()
      .parse(payload);
    if (keepId === removeId) fail("Elegí dos fichas distintas.");
    const keep = findProspect(state, keepId),
      remove = findProspect(state, removeId);
    if (!duplicates(keep, [remove]).length)
      fail(
        "Las fichas no coinciden por dominio, teléfono o nombre y localidad.",
      );
    keep.activities = [...keep.activities, ...remove.activities].sort(
      (a: any, b: any) => b.at.localeCompare(a.at),
    );
    keep.payments.push(...remove.payments);
    keep.noContact = keep.noContact || remove.noContact;
    // Preserve the removed record's fields as a structured history snapshot, never silently sum quotes.
    activity(
      keep,
      "merge",
      "Ficha fusionada: " +
        JSON.stringify({
          ...remove,
          activities: undefined,
          payments: undefined,
        }),
    );
    for (const t of state.tasks)
      if (t.prospectId === removeId) t.prospectId = keepId;
    for (const d of state.drafts)
      if (d.prospectId === removeId) d.prospectId = keepId;
    if (keep.noContact)
      state.tasks
        .filter((t: any) => t.prospectId === keepId && t.status === "pending")
        .forEach((t: any) => (t.status = "paused"));
    state.prospects = state.prospects.filter((p: any) => p.id !== removeId);
    result = { id: keepId };
  } else if (type === "import") {
    const { csv, lines } = z
      .object({
        csv: z.string().max(2_000_000),
        lines: z.array(z.number().int()).min(1).max(500),
      })
      .strict()
      .parse(payload);
    const rows = safeCSV(csv).filter((r) => lines.includes(r.line));
    if (rows.length !== new Set(lines).size)
      fail("La selección de filas no es válida.");
    for (const row of rows) {
      if (row.error) fail("Fila " + row.line + ": " + row.error);
      const p = prospect.parse(csvToProspect(row.values));
      if (duplicates(p, state.prospects).length)
        fail(
          "Fila " +
            row.line +
            ": duplicado pendiente de revisión. Importá las filas sin duplicados y revisá las demás en el CRM.",
        );
      const created = {
        ...p,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
        activities: [],
        payments: [],
      };
      activity(created, "import", "Importado por CSV · fila " + row.line);
      state.prospects.push(created);
    }
    if (state.prospects.length > 5000)
      fail("Límite de 5.000 contactos alcanzado.");
    result = { count: rows.length };
  } else fail("Acción desconocida.");
  const nextVersion = await db.save(version, state);
  res.json({ version: nextVersion, ...result });
  return;
});
