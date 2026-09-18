# 2bleA Radar

CRM privado para Aaron de 2bleA: buscar negocios, revisar evidencia, guardar prospectos, preparar mensajes y hacer seguimiento. Español argentino, ARS y horario de Buenos Aires. La cuenta comienza vacía.

## Funciones

- Búsqueda **asistida**, con enlaces externos a Google, Maps y perfiles de Instagram. No hay búsqueda automática conectada ni resultados inventados.
- Fichas con fuente, fechas, evidencia, contactos públicos, servicio, presupuesto, etapa y No contactar.
- Tabla y tablero con las ocho etapas comerciales, filtros y apertura de fichas.
- Evaluación 0–100 con desglose: lo desconocido no suma. No mide intención de compra.
- Plantillas editables para WhatsApp, Instagram y email. Borradores persistentes, copia y apertura del canal; sin IA ni envío automático.
- Tareas de hoy, vencidas, próximas, completadas y pausadas. No contactar bloquea acciones también en servidor y pausa las tareas pendientes.
- Presupuesto, venta ganada y cobros efectivos separados. Registro y corrección de cobros con historial.
- CSV UTF-8 con BOM, vista previa, selección de filas válidas, detección de duplicados y protección de fórmulas. Hasta 500 filas por importación y 5.000 contactos.
- Revisión de coincidencias por dominio, teléfono o nombre/localidad; fusión explícita que conserva historial, tareas, borradores y cobros. Los campos de la ficha retirada quedan como evidencia en el historial; no se suman presupuestos.
- Configuración persistente de marca, contactos, servicios, precios y plantillas.

## Preparación local

Se requiere Node.js 24 y pnpm 11.19. No se necesita el agente de Replit.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

Generá el hash de una contraseña exclusiva para el propietario (mínimo 14 caracteres). En Bash, la contraseña no se muestra ni queda en el historial:

```bash
read -rs -p 'Contraseña de propietario: ' RADAR_OWNER_PASSWORD
printf '\n'
printf '%s' "$RADAR_OWNER_PASSWORD" | node scripts/password.mjs
unset RADAR_OWNER_PASSWORD
```

Copiá la salida completa en `RADAR_PASSWORD_HASH` dentro de `.env`; nunca copies la contraseña en el código. Configurá `APP_ORIGIN=http://localhost:5000`.

```bash
pnpm run build:radar
pnpm start
```

Abrí `http://localhost:5000`. Sin `DATABASE_URL`, el modo local usa SQLite persistente en `data/radar.sqlite`. Esa carpeta está excluida de Git. Cerrá el servidor antes de copiar el archivo para un backup, o usá un backup SQLite consistente con WAL.

Para desarrollar con recarga de frontend, iniciá la API en el puerto 5000 y Vite en 5173; configurá `APP_ORIGIN=http://localhost:5173`. Vite reenvía `/api` al servidor. Las variables no se cargan automáticamente en comandos sueltos: usá el inicio documentado o configurá el entorno antes de arrancar cada proceso.

## Producción / Vercel

Se incluye `api/index.ts` y `vercel.json` para servir frontend y API bajo el mismo origen. Seleccioná la raíz del repositorio como Root Directory y Node 24. La configuración de Vercel no fue desplegada ni validada contra una cuenta real en esta entrega.

Variables **solo del servidor**:

| Variable              | Valor                                                            |
| --------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`        | Conexión PostgreSQL dedicada al CRM; usar SSL según el proveedor |
| `RADAR_PASSWORD_HASH` | Salida completa del generador local                              |
| `APP_ORIGIN`          | Origen HTTPS exacto que vas a usar, sin barra final ni ruta      |

No uses SQLite en Vercel: el código rechaza la base local en producción. Las tablas `radar_state`, `radar_sessions` y `radar_auth_limits` se crean al primer acceso, con un estado vacío; no se cargan datos de demostración. El usuario de PostgreSQL necesita permisos de creación inicial y lectura/escritura sobre estas tablas.

La pantalla de login y los archivos estáticos pueden ser públicos; **todos los datos comerciales y sus endpoints requieren sesión de propietario**. Esto no equivale a la protección de despliegue de Vercel. Para ocultar también el login detrás del control de acceso del hosting, configurá una protección de despliegue ya incluida en tu plan; no se contrató ningún servicio.

Referencias: [Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js), [Express en Vercel](https://vercel.com/docs/frameworks/backend/express).

## Modelo de seguridad y persistencia

- Una cuenta de propietario, sin registro público ni apropiación por el primer visitante. Quien conoce la contraseña puede acceder: no compartirla.
- Hash scrypt de contraseña con salt aleatorio; no se almacena contraseña en claro. Sesiones aleatorias, hash en base de datos, expiración de 12 horas, cookie HttpOnly y SameSite Strict; Secure en producción. Rotar el hash invalida las sesiones anteriores.
- Límite de login persistente: 10 intentos por ventana de 15 minutos, global para el propietario. Evita depender de encabezados IP no fiables; un atacante puede provocar temporalmente este bloqueo global.
- Todas las mutaciones verifican origen exacto, JSON y un encabezado propio. No hay CORS abierto.
- Esquemas estrictos, límites de longitud, fechas y monedas validadas, enlaces HTTP/HTTPS y consultas parametrizadas. El servidor no descarga webs ni implementa auditoría web, por lo que no incorpora un cliente HTTP que pueda usarse para SSRF.
- El CRM se guarda como un documento de estado versionado. Un UPDATE condicional atómico evita que dos escrituras con la misma versión se pisen. Ante conflicto, recargar y reabrir la ficha; el borrador no se sobreescribe automáticamente.
- Diseñado para CRM personal, no para multiusuario ni grandes volúmenes. Historial y borradores aumentan el tamaño del documento con el uso.
- Exportar CSV exporta fichas, evaluación e importes de referencia; **no es un backup completo** de sesiones, historial, tareas o cobros. Para recuperar todo, respaldar la base de datos desde el proveedor.

## Pruebas

```bash
pnpm run typecheck
pnpm run build:radar
pnpm test
pnpm run test:ui
```

Las pruebas usan bases SQLite temporales y credenciales efímeras, luego las eliminan. Nunca usan la base de producción.

- Pruebas de API: autenticación/CSRF, creación/edición, etapa, tareas, borradores, No contactar, validaciones, duplicados/fusión, CSV y fórmulas, importes separados, persistencia tras reinicio, logout y límites de login.
- Pruebas DOM con React + jsdom integradas con una API real: búsqueda asistida/estado vacío, formulario, borrador editable/copia, tareas, bloqueo No contactar, importación, menú compacto/tablero y recarga de componente.
- **Pendiente**: validación contra PostgreSQL real y despliegue Vercel; revisión visual en Chrome y en móvil real. jsdom comprueba interacciones, no layout ni contraste visual. El navegador remoto de la sesión bloqueó `localhost`, por lo que no se declara esa revisión realizada.

## Primeros prospectos

1. En Radar elegí rubro, zona y palabras clave; abrí uno de los buscadores externos.
2. Revisá el negocio y copiá su enlace de origen. “No encontrada” no confirma ausencia de web.
3. Registrá nombre, localidad, fuente, fecha y lo que pudiste comprobar.
4. Guardá la ficha. Prepará un mensaje desde Mensajes y revisalo antes de copiar.
5. Registrá el contacto o la respuesta en Historial y cobros y creá la próxima tarea.

No hay búsqueda automática, auditoría web, proveedor de IA ni notificaciones externas conectados. No se envían mensajes automáticamente y no se prometen clientes ni cierres.
