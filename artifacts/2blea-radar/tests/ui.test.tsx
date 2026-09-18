import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import os from "node:os";
import { JSDOM } from "jsdom";

test("interfaz DOM integrada con API y base persistente de prueba", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "radar-ui-")),
    port = 15438,
    origin = "http://localhost:" + port;
  const password = randomBytes(24).toString("hex"),
    salt = randomBytes(16).toString("hex");
  const child = spawn(
    process.execPath,
    ["artifacts/api-server/dist/index.mjs"],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        PORT: String(port),
        APP_ORIGIN: origin,
        RADAR_DB_PATH: path.join(dir, "ui.sqlite"),
        RADAR_PASSWORD_HASH:
          salt + ":" + scryptSync(password, salt, 64).toString("hex"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timeout")),
      10000,
    );
    child.stdout.on("data", (d) => {
      if (d.toString().includes("disponible")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const nodeFetch = globalThis.fetch;
  // A disposable authenticated HTTP fixture; no browser credential entry, no app bypass.
  const login = await nodeFetch(origin + "/api/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Radar-Request": "1",
    },
    body: JSON.stringify({ password }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  assert.equal(login.status, 200);
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: origin, pretendToBeVisual: true },
  );
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
    "Element",
    "Node",
    "NodeFilter",
    "Event",
    "MouseEvent",
    "CustomEvent",
    "MutationObserver",
    "getComputedStyle",
  ])
    Object.defineProperty(globalThis, key, {
      value: (dom.window as any)[key],
      configurable: true,
      writable: true,
    });
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (fn: any) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
  });
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  let copied = "";
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        copied = text;
      },
    },
  });
  dom.window.confirm = () => true;
  globalThis.fetch = async (input: any, init: any = {}) =>
    nodeFetch(new URL(String(input), origin), {
      ...init,
      headers: { ...init.headers, Origin: origin, Cookie: cookie },
    });
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { default: App } = await import("./app.mjs");
  const root = createRoot(document.getElementById("root")!);
  const tick = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
  };
  const until = async (fn: () => boolean) => {
    for (let n = 0; n < 80; n++) {
      if (fn()) return;
      await tick();
    }
    throw new Error("UI timeout: " + document.body.textContent?.slice(-1500));
  };
  const text = () => document.body.textContent || "";
  const button = (name: string) => {
    const b = [
      ...document.querySelectorAll(
        document.querySelector("[role=dialog]")
          ? "[role=dialog] button"
          : "button",
      ),
    ].find((b) => b.textContent?.trim() === name);
    assert.ok(b, "Missing button " + name);
    return b;
  };
  const click = async (name: string) => {
    await act(async () => {
      button(name).click();
    });
    await tick();
  };
  const fill = async (label: string, value: string) => {
    const l = [...document.querySelectorAll("label")].find(
      (l) => l.querySelector("span")?.textContent?.replace(" *", "") === label,
    );
    assert.ok(l, "Missing field " + label);
    const el = l.querySelector("input,textarea,select")!;
    const proto =
      el.tagName === "SELECT"
        ? dom.window.HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(
        new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  try {
    await act(async () => {
      root.render(React.createElement(App));
    });
    await until(() => text().includes("Buscá tu próxima oportunidad"));
    await t.test(
      "buscador asistido y estado vacío, sin datos de demo",
      async () => {
        assert.ok(text().includes("Búsqueda automática pendiente de conexión"));
        assert.ok(
          text().includes("Tu próximo cliente empieza con una búsqueda"),
        );
        const link = document.querySelector('a[href*="google.com/search"]')!;
        assert.match(link.getAttribute("href")!, /Buenos%20Aires/);
      },
    );
    await t.test("crear y editar prospecto desde formulario", async () => {
      await click("Nuevo prospecto");
      await fill("Nombre comercial", "PRUEBA UI");
      await fill("Sitio web", "https://example.com");
      await click("Guardar prospecto");
      await until(() => !document.querySelector("[role=dialog]"));
      assert.ok(text().includes("PRUEBA UI"));
      await click("PRUEBA UI");
      await fill("Nombre comercial", "PRUEBA UI editada");
      await click("Guardar prospecto");
      await until(() => !document.querySelector("[role=dialog]"));
      assert.ok(text().includes("PRUEBA UI editada"));
    });
    await t.test("preparar, editar, guardar y copiar borrador", async () => {
      await click("PRUEBA UI editada");
      await click("Mensajes");
      await click("Preparar borrador");
      await fill("Borrador editable", "Mensaje personalizado PRUEBA");
      await click("Guardar borrador");
      await until(() => text().includes("Primer contacto · WhatsApp"));
      await click("Copiar");
      assert.equal(copied, "Mensaje personalizado PRUEBA");
    });
    await t.test("crear seguimiento y completar desde el resumen", async () => {
      await click("Seguimientos");
      await fill("Acción pendiente", "PRUEBA tarea UI");
      await click("Guardar seguimiento");
      await until(() => text().includes("PRUEBA tarea UI"));
      const complete = document.querySelector(
        'button[aria-label="Completar PRUEBA tarea UI"]',
      ) as HTMLButtonElement;
      assert.ok(complete);
      await act(async () => {
        complete.click();
      });
      await until(() => text().includes("Completada"));
    });
    await t.test("No contactar bloquea controles del mensaje", async () => {
      await click("Ficha");
      const checkbox = [
        ...document.querySelectorAll("input[type=checkbox]"),
      ][0] as HTMLInputElement;
      await act(async () => {
        checkbox.click();
      });
      await click("Guardar prospecto");
      await until(() => !document.querySelector("[role=dialog]"));
      await click("PRUEBA UI editada");
      await click("Mensajes");
      assert.ok(button("Preparar borrador").disabled);
      assert.ok(button("Abrir WhatsApp").disabled);
      assert.ok(button("Copiar").disabled);
      await act(async () => {
        (
          document.querySelector(
            'button[aria-label="Cerrar ficha"]',
          ) as HTMLButtonElement
        ).click();
      });
    });
    await t.test("importación con vista previa y confirmación", async () => {
      await click("Importar CSV");
      await fill("Contenido CSV", "nombre;localidad\nPRUEBA CSV UI;Mendoza");
      await click("Validar y ver vista previa");
      await until(() => text().includes("Lista para importar"));
      await click("Confirmar importación (1)");
      await until(() => !document.querySelector("[role=dialog]"));
      assert.ok(text().includes("PRUEBA CSV UI"));
    });
    await t.test("menú compacto responde y abre CRM/tablero", async () => {
      Object.defineProperty(dom.window, "innerWidth", {
        value: 390,
        configurable: true,
      });
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.Event("resize"));
        (
          document.querySelector(
            'button[aria-label="Abrir menú"]',
          ) as HTMLButtonElement
        ).click();
      });
      assert.ok(document.querySelector(".sidebar.visible"));
      await click("CRM");
      assert.equal(document.querySelector(".sidebar.visible"), null);
      await click("Tablero");
      assert.equal(document.querySelectorAll(".board-column").length, 8);
    });
    await t.test(
      "recarga de componente conserva prospectos en el servidor",
      async () => {
        await act(async () => {
          root.render(null);
        });
        await act(async () => {
          root.render(React.createElement(App));
        });
        await until(() => text().includes("Buscá tu próxima oportunidad"));
        assert.ok(text().includes("PRUEBA UI editada"));
        assert.ok(text().includes("PRUEBA CSV UI"));
      },
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.fetch = nodeFetch;
    child.kill();
    await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  }
});
