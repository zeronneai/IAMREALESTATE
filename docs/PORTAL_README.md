# Portal del equipo I AM Real Estate (`/portal`)

Sistema interno de adquisiciones: remates (foreclosures), leads, listas en lote, inventario y estados de hipoteca. Vive en el mismo proyecto de Vercel que el sitio público, en `https://TU-DOMINIO/portal/`. Tiene `noindex` y está pensado para uso interno.

## Qué hace, por pestaña

| Pestaña | Qué hace |
|---|---|
| **Tablero** | KPIs: remates de la próxima subasta, cuenta regresiva al primer martes del mes, leads calientes (score 70+), valor del inventario, deuda hipotecaria y pagos de los próximos 30 días. Línea de tiempo de subastas, distribución de score, mapa, embudo y tareas. |
| **Remates** | Tabla de Notices of Trustee Sale con filtros (fecha de subasta, C.P., banco, % de equity, valor, años como dueño, dueño ausente, impuestos atrasados, score, estatus), orden por columna, búsqueda y vista de mapa. Al abrir una propiedad: cuenta regresiva, trustee, banco, préstamo original, dueños, dirección postal (ausente o no), teléfonos y correos con banderas DNC y litigante, valor, saldo, equity, impuestos por entidad, gravámenes, años como dueño, año de construcción, metros, legal, estatus, actividad, tareas y explicación del score. |
| **Propiedades** | Todas las propiedades, no solo remates: impuestos atrasados, ausentes, alto equity, vacías, sucesiones. Misma ficha. |
| **Leads en lote** | Seleccionas filas en cualquier tabla y las agregas a una lista. Por lista: skip trace masivo, exportar CSV para REISkip, CSV para GoHighLevel, CSV completo, enviar al CRM por webhook, copiar, quitar duplicados. |
| **Inventario** | Propiedades de IAM: compra, remodelación real vs presupuesto, ARV, estatus (compra, remodelación, en venta, rentada, vendida), inquilino y renta, ganancia y ROI proyectados. |
| **Estados de hipoteca** | Subes el PDF o foto del estado de cuenta y la IA lee banco, últimos 4 del préstamo, saldo, tasa, pago, escrow, fecha límite y recargos. Tú revisas y guardas. Alertas de vencido o por vencer, totales y gráfica del saldo. |
| **Importar datos** | 1) PDFs de Notice of Trustee Sale, varios a la vez, leídos por IA con revisión antes de guardar. 2) Botón para traer los avisos del mes desde la fuente configurada. 3) Archivo de EPCAD para completar dueño, valor, año, metros y última escritura. 4) Cualquier CSV (REISkip, Landglide, PropStream) con mapeo de columnas. |
| **Ajustes** | Qué integraciones están conectadas, pesos del score y equipo. |

## Modo demo vs producción

* **Demo (como está hoy):** sin variables de entorno, el portal usa datos ficticios guardados en el navegador. Todos los nombres llevan "Demo", los teléfonos son 555-01xx y los bancos son genéricos. Los botones de skip trace y CRM simulan el resultado. Hay una franja "Datos demo" arriba.
* **Producción:** al configurar Supabase el portal pide inicio de sesión por correo (magic link) y guarda todo en la base de datos del equipo.

## Arquitectura

* Frontend: Vite + JavaScript (sin framework), entrada `portal/index.html`, código en `src/portal/`. Mapa con Leaflet y teselas de OpenStreetMap.
* Datos: `src/portal/store.js` con dos motores, demo (localStorage) y Supabase (Postgres + Auth + Storage). Esquema en `supabase/schema.sql`.
* API (Vercel Functions en `api/`):
  * `GET /api/health` estado de integraciones (nunca devuelve llaves).
  * `POST /api/extract-notice` lee un Notice of Trustee Sale (Claude o Gemini).
  * `POST /api/extract-statement` lee un estado de hipoteca (Claude o Gemini).
  * `POST /api/skiptrace` BatchData o REISkip.
  * `POST /api/crm-push` envía leads al webhook de GoHighLevel.
  * `POST /api/sources/epcounty` adaptador de la fuente de avisos del condado.
  * `POST /api/enrich` adaptador de EPCAD. `POST /api/taxes` adaptador de impuestos.
  * `GET /api/cron/refresh` diario (Vercel Cron, ver `vercel.json`): trae avisos y los guarda en `notice_inbox`.
* Las llaves viven solo en Vercel. El navegador nunca las ve.

## Variables de entorno (Vercel > Settings > Environment Variables)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (también la usa la API para validar sesión) | Para producción |
| `VITE_SUPABASE_ANON_KEY` | Llave pública anon de Supabase | Para producción |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para el cron que guarda avisos. Nunca en el frontend | Para el cron |
| `ANTHROPIC_API_KEY` | Claude lee avisos y estados de cuenta | Una de las dos IA |
| `ANTHROPIC_EXTRACT_MODEL` | Opcional, modelo de Claude a usar | No |
| `GEMINI_API_KEY` | Alternativa a Claude (ya la tienen en otros proyectos) | Una de las dos IA |
| `SKIPTRACE_PROVIDER` | `batchdata` o `reiskip` | Para skip trace |
| `BATCHDATA_API_KEY` | Llave de BatchData | Si usan BatchData |
| `BATCHDATA_SKIPTRACE_URL` | Opcional, si BatchData les da otro endpoint | No |
| `REISKIP_API_KEY`, `REISKIP_API_URL` | Acceso API de REISkip (se habilita por cuenta) | Si usan REISkip |
| `GHL_WEBHOOK_URL` | Inbound webhook de un workflow de GoHighLevel | Para "Enviar al CRM" |
| `FORECLOSURE_FEED_PROVIDER`, `EPCOUNTY_SOURCE_URL`, `EPCOUNTY_SOURCE_KEY` | Fuente automática de avisos (ver abajo) | Para el botón "Traer avisos" y el cron |
| `EPCAD_LOOKUP_URL`, `EPCAD_LOOKUP_KEY` | Servicio de búsqueda en EPCAD | Opcional |
| `TAX_LOOKUP_URL`, `TAX_LOOKUP_KEY` | Servicio de impuestos | Opcional |
| `CRON_SECRET` | Protege `/api/cron/refresh` (Vercel lo manda solo) | Recomendado |
| `PORTAL_ACCESS_KEY` | Si conectan llaves de pago ANTES de tener Supabase, ciérrenlas con esta clave (el portal la manda desde `localStorage.iam_portal_key`) | Recomendado sin Supabase |
| `VITE_MAP_TILES_URL` | Opcional, teselas de mapa con llave (Mapbox, MapTiler) para uso intenso | No |

## Configurar Supabase (15 minutos)

1. Crear proyecto en supabase.com (región US West o US Central).
2. SQL Editor: pegar y correr `supabase/schema.sql`. Crea tablas, políticas RLS y los buckets privados `statements` y `notices`.
3. Authentication > URL Configuration: agregar `https://TU-DOMINIO/portal/` como Redirect URL.
4. Copiar `Project URL` y `anon key` a Vercel como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y `service_role` como `SUPABASE_SERVICE_ROLE_KEY`. Redeploy.
5. Cada persona del equipo entra a `/portal`, pide su link y entra una vez. Luego un admin la agrega en SQL:
   `insert into team_members (user_id, email, role) select id, email, 'agent' from auth.users where email = 'correo@dominio.com';`
   Sin estar en `team_members` no puede leer nada (RLS).

## De dónde salen los datos y qué permisos se necesitan

| Dato | Fuente | Costo / permiso |
|---|---|---|
| Avisos de remate (fecha, dirección, deudores, banco, trustees, préstamo) | Notices of Trustee's Sale que se presentan en la Oficina del County Clerk de El Paso 21 días antes de la subasta del primer martes de cada mes | Registro público. **No hemos verificado cómo los publica El Paso en línea**. Opciones: a) descargar o fotografiar los avisos del mes y subirlos en Importar (la IA los lee); b) pedir al County Clerk el paquete mensual o acceso a su búsqueda; c) contratar un feed de pre-foreclosures (ATTOM, BatchData, PropertyRadar, PropStream) y conectarlo en `api/sources/epcounty.js`. Si se hace scraping del sitio del condado, revisar primero sus términos de uso. |
| Dueño, valor, año de construcción, metros, última escritura, legal | El Paso Central Appraisal District (EPCAD), archivos de exportación certificados en epcad.org/OpenGovernment | Gratis, registro público. Se importa en "EPCAD" en Importar. Para búsqueda en vivo hace falta un servicio propio o un proveedor de datos. |
| Impuestos atrasados por entidad | Oficina consolidada de impuestos de El Paso (actweb.acttax.com) | Público por cuenta, pero sin API. Para automatizar: proveedor de datos (por ejemplo TaxNetUSA ofrece datos de morosidad de El Paso) o revisar los términos del sitio. Mientras tanto se puede importar por CSV. |
| Gravámenes (HELOC, juicios, mecánicos) | Registros del County Clerk o proveedor de datos | Público, pero requiere búsqueda de títulos o proveedor de pago. |
| Teléfonos y correos de dueños | Skip tracing: REISkip (cerca de $0.10 a $0.15 por registro, carga por archivo) o BatchData (API en tiempo real) | Cuenta de pago. Las respuestas traen banderas DNC y litigante. |
| Valor de mercado estimado | EPCAD o AVM de un proveedor (BatchData, ATTOM) | Gratis (EPCAD) o pago (AVM). |
| CRM | GoHighLevel (IAM ya lo usa en iamrealestate.org) | Crear un workflow con trigger "Inbound Webhook" y pegar la URL en `GHL_WEBHOOK_URL`. |
| Lectura de PDFs con IA | Claude (Anthropic) o Gemini (Google) | Pago por uso, centavos por documento. |

## Cumplimiento (importante antes de llamar o mandar mensajes)

* **TCPA y Do Not Call:** no llamar ni mandar SMS a números marcados DNC o litigante. Para mensajes de texto masivos se necesita consentimiento y registro A2P 10DLC en GoHighLevel. El portal tacha los DNC y los excluye del CSV de GoHighLevel.
* **Texas:** la compra de casas en remate a dueños en apuros puede caer en reglas de Texas para "foreclosure rescue" y contratos con vendedores en default. Validar guiones y contratos con su abogado.
* **Licencia:** si un agente con licencia de TREC participa, aplican las reglas de TREC (avisos IABS, publicidad). El portal es interno y no es publicidad, pero los mensajes a dueños sí cuentan.
* **Datos personales:** solo el equipo con login puede ver la información (RLS de Supabase). No exportar listas a terceros sin razón de negocio.

## Fase 2 (ideas)

* Feed automático de avisos del mes y alertas por correo o SMS al equipo cuando entra una propiedad con score 70+.
* Cartas automáticas a dueños (Lob o Click2Mail) desde una lista.
* Marcador (power dialer) y secuencias de SMS en GoHighLevel conectadas al estatus.
* Comparables automáticos y oferta sugerida con la regla del 70%.
* Resultado de la subasta (vendida, pospuesta, cancelada) y seguimiento de la reventa.
* App móvil para "manejar por la zona" con mapa y fotos.
