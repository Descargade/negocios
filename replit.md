# 2bleA Radar

CRM privado de Aaron de 2bleA. El frontend es React/Vite; API Express; PostgreSQL en producción y SQLite persistente solo local. Leer README.md para configuración, pruebas y límites comprobados.

- Instalar con pnpm; Node 24.
- `pnpm run build:radar` compila frontend y backend.
- `pnpm start` sirve ambos bajo el mismo origen y carga `.env` si existe.
- `pnpm run typecheck`, `pnpm test`, `pnpm run test:ui` verifican el circuito.
- No inventar prospectos ni métricas. Búsqueda asistida y plantillas identificadas, sin IA.
- No contratar servicios, activar APIs pagas ni publicar contactos sin autorización.
- Mantener la autenticación: no hay contraseña predeterminada ni modo público de datos.
- No modificar ni borrar bases existentes para probar. Los tests tienen bases efímeras propias.
