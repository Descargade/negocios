export const stages = [
  "Nuevo",
  "Por revisar",
  "Contactado",
  "Respondió",
  "Reunión",
  "Presupuesto enviado",
  "Ganado",
  "Perdido",
];
export const sectors = [
  "Gráfica",
  "Barbería",
  "Centro de estética",
  "Gimnasio",
  "Taller",
  "Restaurante",
  "Tienda",
  "Otro",
];
export const webStates = [
  "Pendiente",
  "Web encontrada",
  "No encontrada",
  "Ausencia confirmada",
];
export const reviews = ["Pendiente", "Inferida", "Verificada"];
export const criteria = [
  ["noWeb", "Ausencia de web confirmada manualmente", 25],
  ["webIssues", "Problemas de la web comprobados", 20],
  ["need", "Necesidad observada de catálogo, consultas o turnos", 25],
  ["publicChannel", "Canal comercial público verificado", 15],
  ["fit", "Encaje observado con los servicios", 15],
];
export const messageTypes = [
  "Primer contacto",
  "Seguimiento",
  "Respuesta a interesados",
  "Presentación de presupuesto",
];
export const defaultSettings = {
  name: "Aaron Gonzalez",
  brand: "2bleA",
  signature: "Aaron de 2bleA",
  email: "2bleadeveloper@gmail.com",
  phone: "+54 9 2622530837",
  website: "https://2blea-dev.vercel.app/",
  services: [
    { name: "Página web", price: "" },
    { name: "Catálogo online", price: "" },
    { name: "Sistema de turnos", price: "" },
    { name: "Aplicación a medida", price: "" },
  ],
  templates: {
    "Primer contacto":
      "Hola, ¿cómo va? Soy {firma}. Quería consultar si a {negocio} le serviría conversar sobre {servicio}. Si les interesa, puedo compartirles una propuesta breve. ¡Gracias!",
    Seguimiento:
      "Hola, ¿cómo va? Soy {firma}. Quería retomar la conversación con {negocio} sobre {servicio}. Si les sigue interesando, lo vemos cuando les quede cómodo.",
    "Respuesta a interesados":
      "¡Gracias por el interés! Para preparar una propuesta para {negocio}, ¿qué les gustaría resolver con {servicio}? Soy {firma}.",
    "Presentación de presupuesto":
      "Hola, les comparto la propuesta de {servicio} para {negocio}: {presupuesto}. Si les parece, podemos revisar el alcance y los próximos pasos. {firma}.",
  },
};
export function initialState() {
  return {
    prospects: [],
    tasks: [],
    drafts: [],
    settings: structuredClone(defaultSettings),
  };
}
export function argentinaToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function money(cents) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function normal(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function domain(s = "") {
  try {
    return new URL(s).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function phoneKey(s = "") {
  let n = s.replace(/\D/g, "").replace(/^00/, "");
  if (n.startsWith("549")) n = "54" + n.slice(3);
  if (n.length === 10) n = "54" + n;
  return n;
}
export function duplicates(p, all) {
  return all.filter(
    (o) =>
      (!p.id || o.id !== p.id) &&
      ((domain(p.website) && domain(p.website) === domain(o.website)) ||
        (phoneKey(p.phone) && phoneKey(p.phone) === phoneKey(o.phone)) ||
        (normal(p.name) &&
          normal(p.name) === normal(o.name) &&
          normal(p.city) === normal(o.city))),
  );
}
export function score(p) {
  const breakdown = criteria.map(([key, label, weight]) => {
    const signal = p.signals?.[key];
    const verified =
      signal?.value === "yes" &&
      Boolean(signal.evidence?.trim()) &&
      Boolean(p.source) &&
      Boolean(p.verifiedAt);
    const consistent =
      key === "noWeb"
        ? p.webStatus === "Ausencia confirmada"
        : key === "webIssues"
          ? Boolean(p.website)
          : key === "publicChannel"
            ? Boolean(p.phone || p.email || p.social)
            : true;
    return {
      key,
      label,
      weight,
      points: verified && consistent ? weight : 0,
      known: signal?.value === "no" || (verified && consistent),
    };
  });
  return {
    value: breakdown.reduce((s, c) => s + c.points, 0),
    insufficient: breakdown.filter((c) => c.known).length < 2,
    breakdown,
  };
}
export function renderMessage(p, settings, type) {
  if (p.noContact)
    throw new Error("Este negocio está marcado como No contactar.");
  if (type === "Seguimiento" && !p.activities.some((a) => a.kind === "contact"))
    throw new Error(
      "Registrá un contacto previo antes de preparar un seguimiento.",
    );
  if (
    type === "Respuesta a interesados" &&
    !p.activities.some((a) => a.kind === "response")
  )
    throw new Error(
      "Registrá la respuesta del negocio antes de usar esta plantilla.",
    );
  if (
    type === "Presentación de presupuesto" &&
    (!p.service || p.quotedCents <= 0)
  )
    throw new Error("Completá el servicio y el importe presupuestado.");
  const vars = {
    firma: settings.signature,
    negocio: p.name,
    servicio: p.service || "una página web o una solución digital",
    presupuesto: p.quotedCents ? money(p.quotedCents) : "importe por definir",
  };
  return (settings.templates[type] || "").replace(
    /\{(firma|negocio|servicio|presupuesto)\}/g,
    (_, k) => vars[k],
  );
}
export const csvFields = [
  "nombre",
  "rubro",
  "localidad",
  "web",
  "redes",
  "telefono",
  "email",
  "fuente",
  "fecha_consulta",
  "fecha_verificacion",
  "revision",
  "presencia_web",
  "persona_contacto",
  "observaciones",
  "oportunidad",
  "servicio",
  "presupuesto_ars",
  "venta_ganada_ars",
  "evaluacion_json",
  "etapa",
  "no_contactar",
];
export function csvSafe(value) {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function exportCSV(prospects) {
  const rows = prospects.map((p) => [
    p.name,
    p.sector,
    p.city,
    p.website,
    p.social,
    p.phone,
    p.email,
    p.source,
    p.consultedAt,
    p.verifiedAt,
    p.review,
    p.webStatus,
    p.contactPerson,
    p.notes,
    p.opportunity,
    p.service,
    (p.quotedCents / 100).toFixed(2),
    ((p.wonCents || 0) / 100).toFixed(2),
    JSON.stringify(p.signals || {}),
    p.stage,
    p.noContact ? "si" : "no",
  ]);
  return (
    "\uFEFF" +
    [csvFields, ...rows].map((row) => row.map(csvSafe).join(";")).join("\r\n")
  );
}
export function parseCSV(text) {
  if (text.length > 2_000_000) throw new Error("El archivo supera los 2 MB.");
  text = text.replace(/^\uFEFF/, "");
  const line = text.split(/\r?\n/, 1)[0];
  const separator = line.includes(";") ? ";" : ",";
  let rows = [],
    row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Comillas CSV inválidas.");
      quoted = true;
    } else if (c === separator || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== separator) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error("Contenido después del cierre de comillas.");
      cell += c;
    }
  }
  if (quoted) throw new Error("El archivo tiene comillas sin cerrar.");
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length > 501)
    throw new Error("Importá hasta 500 filas por archivo.");
  if (rows.length < 2) throw new Error("El CSV no contiene contactos.");
  const headers = rows.shift().map((h) => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    throw new Error("Hay columnas repetidas.");
  if (!headers.includes("nombre") || !headers.includes("localidad"))
    throw new Error("Faltan las columnas nombre y localidad.");
  const unknown = headers.filter((h) => !csvFields.includes(h));
  if (unknown.length)
    throw new Error("Columnas no reconocidas: " + unknown.join(", "));
  return rows.map((row, i) => {
    if (row.length !== headers.length)
      return { line: i + 2, error: "La cantidad de columnas no coincide." };
    const values = Object.fromEntries(
      headers.map((h, j) => [
        h,
        row[j].replace(/^'(?=[\s\u0000-\u001f]*[=+\-@])/u, "").trim(),
      ]),
    );
    return { line: i + 2, values };
  });
}
export function csvToProspect(v) {
  const amount = v.presupuesto_ars || "0";
  const won = v.venta_ganada_ars || "0";
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(won))
    throw new Error("Venta ganada inválida.");
  let signals = {};
  if (v.evaluacion_json) {
    try {
      signals = JSON.parse(v.evaluacion_json);
    } catch {
      throw new Error("evaluacion_json no es un JSON válido.");
    }
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount))
    throw new Error(
      "Presupuesto inválido: usá 150000 o 150000,50 sin separador de miles.",
    );
  if (
    v.no_contactar &&
    !["si", "sí", "no"].includes(v.no_contactar.toLowerCase())
  )
    throw new Error("no_contactar debe ser si o no.");
  return {
    name: v.nombre,
    city: v.localidad,
    sector: v.rubro || "Otro",
    website: v.web || "",
    social: v.redes || "",
    phone: v.telefono || "",
    email: v.email || "",
    source: v.fuente || "",
    consultedAt: v.fecha_consulta || "",
    verifiedAt: v.fecha_verificacion || "",
    review: v.revision || "Pendiente",
    webStatus: v.presencia_web || "Pendiente",
    contactPerson: v.persona_contacto || "",
    notes: v.observaciones || "",
    opportunity: v.oportunidad || "",
    service: v.servicio || "",
    quotedCents: Math.round(Number(amount.replace(",", ".")) * 100),
    wonCents: Math.round(Number(won.replace(",", ".")) * 100),
    stage: v.etapa || "Nuevo",
    noContact: ["si", "sí"].includes((v.no_contactar || "").toLowerCase()),
    signals,
  };
}
