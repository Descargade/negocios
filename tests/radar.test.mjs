import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  score,
  duplicates,
  exportCSV,
  parseCSV,
  csvToProspect,
  argentinaToday,
  defaultSettings,
  renderMessage,
} from "../shared/radar.mjs";
let child,
  dir,
  cookie = "",
  version = 0,
  id,
  taskId,
  draftId;
const port = 15437,
  origin = "http://localhost:" + port;
const password = randomBytes(24).toString("hex"),
  salt = randomBytes(16).toString("hex");
const passwordHash =
  salt + ":" + scryptSync(password, salt, 64).toString("hex");
async function request(route, body, options = {}) {
  const res = await fetch(origin + "/api" + route, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? {
            "Content-Type": "application/json",
            Origin: origin,
            "X-Radar-Request": "1",
          }
        : {}),
      Cookie: cookie,
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { res, data };
}
async function start(extra = {}) {
  child = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "",
      PORT: String(port),
      APP_ORIGIN: origin,
      RADAR_PASSWORD_HASH: passwordHash,
      RADAR_DB_PATH: path.join(dir, "radar.sqlite"),
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server did not start")),
      15000,
    );
    child.stdout.on("data", (v) => {
      if (v.toString().includes("disponible")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Server exit " + code));
    });
  });
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
async function state() {
  const { res, data } = await request("/state");
  assert.equal(res.status, 200, JSON.stringify(data));
  version = data.version;
  return data.state;
}
async function action(type, payload, expected = 200, v = version) {
  const { res, data } = await request("/action", { version: v, type, payload });
  assert.equal(res.status, expected, JSON.stringify(data));
  if (res.ok && type !== "contactAction") version = data.version;
  return data;
}
const base = (overrides = {}) => ({
  name: "PRUEBA — Gráfica controlada",
  city: "Buenos Aires",
  sector: "Gráfica",
  website: "https://example.com",
  source: "https://example.com",
  consultedAt: argentinaToday(),
  ...overrides,
});
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "radar-tests-"));
  await start();
});
after(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true });
});
test("circuito persistente y autorización real en endpoints", async (t) => {
  await t.test(
    "sin sesión ni cookie falsificada no se pueden leer/exportar datos",
    async () => {
      assert.equal((await request("/state")).res.status, 401);
      assert.equal((await request("/export")).res.status, 401);
      assert.equal(
        (
          await request("/state", undefined, {
            headers: { Cookie: "radar_session=falsa" },
          })
        ).res.status,
        401,
      );
      assert.equal(
        (
          await request("/action", {
            version: 0,
            type: "settings",
            payload: {},
          })
        ).res.status,
        401,
      );
    },
  );
  await t.test(
    "rechaza contraseña incorrecta y CSRF; inicia sesión con cookie HttpOnly",
    async () => {
      assert.equal(
        (await request("/login", { password: "incorrecta" })).res.status,
        401,
      );
      assert.equal(
        (
          await request(
            "/login",
            { password },
            { headers: { Origin: "https://evil.example" } },
          )
        ).res.status,
        403,
      );
      const { res } = await request("/login", { password });
      assert.equal(res.status, 200);
      const header = res.headers.get("set-cookie");
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      cookie = header.split(";")[0];
      assert.equal((await state()).prospects.length, 0);
    },
  );
  await t.test("crea prospecto y persiste al volver a consultar", async () => {
    const created = await action("saveProspect", { data: base() });
    id = created.id;
    assert.equal((await state()).prospects[0].id, id);
  });
  await t.test(
    "edita, registra movimiento y rechaza actualizaciones concurrentes obsoletas",
    async () => {
      const v = version;
      await action("saveProspect", {
        id,
        data: base({
          name: "PRUEBA editada",
          opportunity: "Información pendiente de revisión",
        }),
      });
      await action("stage", { id, stage: "Por revisar" });
      await action("stage", { id, stage: "Perdido" }, 409, v);
      const p = (await state()).prospects[0];
      assert.equal(p.name, "PRUEBA editada");
      assert.equal(p.stage, "Por revisar");
      assert.ok(p.activities.some((a) => a.kind === "stage"));
    },
  );
  await t.test("crea, completa y reprograma seguimiento", async () => {
    await action("task", {
      prospectId: id,
      title: "PRUEBA seguimiento",
      due: argentinaToday(),
      status: "pending",
    });
    let s = await state();
    taskId = s.tasks[0].id;
    await action("task", {
      id: taskId,
      prospectId: id,
      title: "PRUEBA seguimiento",
      due: argentinaToday(),
      status: "done",
    });
    assert.equal((await state()).tasks[0].status, "done");
    await action("task", {
      id: taskId,
      prospectId: id,
      title: "PRUEBA reprogramada",
      due: "2030-01-01",
      status: "pending",
    });
  });
  await t.test(
    "genera, edita y guarda borrador; seguimiento exige contacto previo",
    async () => {
      await action(
        "draft",
        { prospectId: id, channel: "WhatsApp", type: "Seguimiento" },
        400,
      );
      const d = await action("draft", {
        prospectId: id,
        channel: "WhatsApp",
        type: "Primer contacto",
      });
      draftId = d.id;
      let s = await state();
      assert.match(s.drafts[0].text, /Aaron de 2bleA/);
      await action("draft", {
        id: draftId,
        prospectId: id,
        channel: "Email",
        type: "Primer contacto",
        text: "Borrador editado de prueba.",
      });
      assert.equal(
        (await state()).drafts[0].text,
        "Borrador editado de prueba.",
      );
      await action("activity", {
        id,
        kind: "contact",
        text: "Contacto de prueba registrado",
      });
      await action("draft", {
        prospectId: id,
        channel: "Email",
        type: "Seguimiento",
      });
      await action("activity", {
        id,
        kind: "response",
        text: "Respuesta de prueba registrada",
      });
      assert.equal((await state()).prospects[0].stage, "Respondió");
    },
  );
  await t.test(
    "No contactar pausa tareas y bloquea borradores, copia, canales y nuevas tareas",
    async () => {
      await action("saveProspect", {
        id,
        data: base({ name: "PRUEBA editada", noContact: true }),
      });
      assert.equal((await state()).tasks[0].status, "paused");
      for (const channel of ["copy", "WhatsApp", "Instagram", "Email"])
        await action("contactAction", { id, channel }, 403);
      await action(
        "draft",
        {
          prospectId: id,
          channel: "WhatsApp",
          type: "Primer contacto",
          text: "Intento",
        },
        403,
      );
      await action(
        "task",
        {
          prospectId: id,
          title: "Bloqueada",
          due: argentinaToday(),
          status: "pending",
        },
        403,
      );
      await action("stage", { id, stage: "Contactado" }, 403);
      await action("activity", { id, kind: "contact", text: "Bloqueado" }, 403);
    },
  );
  await t.test(
    "información no verificada y URLs peligrosas se rechazan",
    async () => {
      await action(
        "saveProspect",
        { data: base({ name: "x", website: "javascript:alert(1)" }) },
        400,
      );
      await action(
        "saveProspect",
        {
          id,
          data: base({ signals: { fit: { value: "yes", evidence: "Algo" } } }),
        },
        400,
      );
      await action(
        "saveProspect",
        { id, data: base({ review: "Verificada", verifiedAt: "2099-01-01" }) },
        400,
      );
    },
  );
  await t.test(
    "duplicados exigen revisión y fusión conserva tareas/cobros/No contactar",
    async () => {
      await action(
        "saveProspect",
        { data: base({ name: "Duplicado PRUEBA" }) },
        409,
      );
      const d = await action("saveProspect", {
        data: base({ name: "Duplicado PRUEBA" }),
        allowDuplicate: true,
      });
      await action("task", {
        prospectId: d.id,
        title: "Duplicado seguimiento",
        due: argentinaToday(),
        status: "pending",
      });
      await action("payment", {
        id: d.id,
        cents: 10000,
        date: argentinaToday(),
        note: "Pago de prueba",
      });
      await action("merge", { keepId: id, removeId: d.id });
      const s = await state();
      assert.equal(s.prospects.length, 1);
      assert.equal(s.prospects[0].payments.length, 1);
      assert.equal(s.prospects[0].noContact, true);
      assert.ok(
        s.tasks.every((t) => t.status === "paused" && t.prospectId === id),
      );
    },
  );
  await t.test(
    "CSV vista previa con errores y duplicados, importa atómicamente y protege fórmulas",
    async () => {
      const csv =
        'nombre;localidad;telefono;web\r\n"=1+1";Mendoza;+5492615550100;\r\n"=1+1";Mendoza;+5492615550100;\r\nInvalido;CABA;;javascript:alert(1)';
      const { data } = await request("/import/preview", { csv });
      assert.equal(data.rows.length, 3);
      assert.equal(data.rows[0].error, null);
      assert.equal(data.rows[1].duplicates.length, 1);
      assert.ok(data.rows[2].error);
      await action("import", { csv, lines: [2, 3] }, 400);
      assert.equal((await state()).prospects.length, 1);
      await action("import", { csv, lines: [2] });
      assert.equal((await state()).prospects.length, 2);
      await action("import", { csv, lines: [2] }, 400);
      const res = await fetch(origin + "/api/export", {
        headers: { Cookie: cookie },
      });
      assert.equal(res.status, 200);
      const bytes = Buffer.from(await res.arrayBuffer());
      assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf");
      const text = bytes.toString("utf8");
      assert.ok(text.includes('"\'=1+1"'));
      assert.ok(text.includes('"\'+5492615550100"'));
      assert.equal(parseCSV(text).length, 2);
    },
  );
  await t.test(
    "presupuesto, venta ganada y cobro permanecen separados",
    async () => {
      const s = await state();
      const p = s.prospects.find((p) => p.id !== id);
      await action("saveProspect", {
        id: p.id,
        data: base({
          name: "Venta PRUEBA",
          website: "",
          quotedCents: 300000,
          wonCents: 250000,
          stage: "Ganado",
        }),
      });
      await action("payment", {
        id: p.id,
        cents: 50000,
        date: argentinaToday(),
        note: "Seña",
      });
      const saved = (await state()).prospects.find((v) => v.id === p.id);
      assert.equal(saved.quotedCents, 300000);
      assert.equal(saved.wonCents, 250000);
      assert.equal(
        saved.payments.reduce((s, p) => s + p.cents, 0),
        50000,
      );
      await action(
        "payment",
        { id: p.id, cents: -1, date: argentinaToday(), note: "" },
        400,
      );
    },
  );
  await t.test(
    "persisten datos y sesión después de reiniciar el proceso",
    async () => {
      await stop();
      await start();
      const s = await state();
      assert.equal(s.prospects.length, 2);
      assert.ok(
        s.drafts.some(
          (d) => d.id === draftId && d.text === "Borrador editado de prueba.",
        ),
      );
      assert.equal(s.tasks[0].status, "paused");
    },
  );
  await t.test("logout revoca la sesión en servidor", async () => {
    assert.equal((await request("/logout", {})).res.status, 200);
    assert.equal((await request("/state")).res.status, 401);
  });
  await t.test(
    "límite de login persiste entre intentos y configuración ausente cierra acceso",
    async () => {
      for (let i = 0; i < 10; i++)
        assert.equal(
          (await request("/login", { password: "wrong" })).res.status,
          401,
        );
      assert.equal((await request("/login", { password })).res.status, 429);
      await stop();
      await start({ RADAR_PASSWORD_HASH: "" });
      assert.equal((await request("/state")).res.status, 503);
      assert.equal((await request("/login", { password })).res.status, 503);
    },
  );
});
test("puntuación no premia lo desconocido y requiere evidencia", () => {
  assert.equal(score({}).value, 0);
  assert.equal(score({}).insufficient, true);
  assert.equal(
    score({ signals: { fit: { value: "yes", evidence: "x" } } }).value,
    0,
  );
  assert.equal(
    score({
      source: "https://example.com",
      verifiedAt: "2026-09-16",
      signals: {
        fit: { value: "yes", evidence: "Observación comprobada" },
        need: { value: "no", evidence: "" },
      },
    }).value,
    15,
  );
});
test("normaliza dominios, teléfonos y nombres/localidad", () => {
  assert.equal(
    duplicates({ website: "https://www.example.com/a" }, [
      { website: "https://example.com/b" },
    ]).length,
    1,
  );
  assert.equal(
    duplicates({ phone: "+54 9 11 1234 5678" }, [{ phone: "11 1234 5678" }])
      .length,
    1,
  );
  assert.equal(
    duplicates({ name: "Gráfica Ñ", city: "Mendoza" }, [
      { name: "grafica n", city: "MENDOZA" },
    ]).length,
    1,
  );
});
test("CSV comillas, saltos, acentos, fórmulas y campos desconocidos", () => {
  const p = {
    name: 'Gráfica "A"\nÑ',
    city: "CABA",
    sector: "Gráfica",
    quotedCents: 100,
    notes: ' \t=HYPERLINK("bad")',
    stage: "Nuevo",
  };
  const csv = exportCSV([p]);
  const rows = parseCSV(csv);
  assert.equal(rows[0].values.nombre, p.name);
  assert.equal(csvToProspect(rows[0].values).quotedCents, 100);
  assert.match(csv, /' \t=HYPERLINK/);
  assert.throws(() => parseCSV('nombre;localidad\n"x;y'));
  assert.throws(() => parseCSV("nombre;localidad;extra\nx;y;z"));
});
test("plantillas no inventan auditorías y respetan restricciones", () => {
  assert.throws(() =>
    renderMessage({ noContact: true }, defaultSettings, "Primer contacto"),
  );
  assert.throws(() =>
    renderMessage({ activities: [] }, defaultSettings, "Seguimiento"),
  );
  assert.match(
    renderMessage(
      { name: "Negocio PRUEBA", activities: [] },
      defaultSettings,
      "Primer contacto",
    ),
    /Quería consultar/,
  );
});
