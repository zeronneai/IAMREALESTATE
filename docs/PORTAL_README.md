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
| **Estados de hipoteca** | Subes el PDF o foto del estado de cuenta y el lector sin llave (pdf.js + reglas, OCR si es foto) saca banco, últimos 4 del préstamo, saldo, tasa, pago, escrow, fecha límite, recargo y atraso. Los campos dudosos salen marcados. Tú revisas y guardas. Alertas de vencido o por vencer, totales y gráfica del saldo. |
| **Importar datos** | 1) PDFs de Notice of Trustee Sale o el paquete mensual del condado (un PDF con muchos avisos se separa solo), leídos SIN llave en el navegador, con OCR para escaneados; cada campo trae su nivel de confianza y el texto original al lado. 2) Botón para traer los avisos del mes desde una fuente permitida. 3) Índice de EPCAD desde los archivos "~" de su portal de datos abiertos. 4) Lista de impuestos atrasados (PDF o CSV). 5) Cualquier CSV (REISkip, Landglide, PropStream). Cada tarjeta tiene botón "Probar un ejemplo" con archivos ficticios. |
| **Ruta de campo** | Seleccionas propiedades y el portal arma el orden de visita desde la oficina (1522 Montana), las numera en el mapa, abre la ruta en Google Maps (en partes de 10 paradas), imprime hoja de ruta y en el celular registra cada visita (no abrieron, platicamos, dejé nota, parece vacía). |
| **Correo directo** | Desde una selección o una lista: carta 8.5x11, postal 6x9 o etiquetas Avery 5160 en PDF, en inglés o español, con vista previa. Se manda a la dirección postal del dueño si es ausente. CSV para Lob o Click2Mail. Las plantillas se editan en Ajustes. |
| **Ficha de la propiedad** | Además de lo anterior: botones de investigación gratis (TruePeopleSearch, FastPeopleSearch, Whitepages, Google, Facebook, EPCAD, impuestos, County Clerk, Street View, Zillow), agregar teléfono o correo encontrado a mano con su fuente y fecha, marcar DNC, agregar gravámenes y buscar en el índice de EPCAD. |
| **Ajustes** | Qué funciona sin llave y qué servicios externos están conectados, lista de No llamar (DNC), plantillas de correo y remitente, pesos del score y equipo. |

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
* Lector sin llave (como el portal de ESC): `src/portal/pdfread.js` saca el texto con pdf.js y rearma los renglones por posición (`src/portal/parse/rows.js`); si una página no tiene texto la dibuja y la lee con OCR (tesseract.js, se descarga de un CDN público la primera vez). Las reglas viven en `src/portal/parse/` (`notice.js`, `statement.js`, `table.js`, `epcad.js`, `address.js`) y son las mismas en el navegador y en la API. Pruebas: `npm run test:parsers` con datos ficticios en `src/portal/fixtures/`.
* Índice de EPCAD y lista DNC se guardan en IndexedDB del navegador (son grandes). `GET /api/cron/epcad` (semanal) puede armar el índice en el servidor y guardarlo en Supabase Storage.
* `/api/extract-notice` y `/api/extract-statement` (Claude o Gemini) quedan solo como "Ayuda de IA (opcional)" para PDFs raros.
* Las llaves viven solo en Vercel. El navegador nunca las ve.

## Variables de entorno (Vercel > Settings > Environment Variables)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (también la usa la API para validar sesión) | Para producción |
| `VITE_SUPABASE_ANON_KEY` | Llave pública anon de Supabase | Para producción |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para el cron que guarda avisos. Nunca en el frontend | Para el cron |
| `ANTHROPIC_API_KEY` | Solo para "Ayuda de IA" en PDFs raros. El lector principal NO necesita llave | Opcional |
| `ANTHROPIC_EXTRACT_MODEL` | Opcional, modelo de Claude a usar | No |
| `GEMINI_API_KEY` | Alternativa a Claude para la ayuda opcional | Opcional |
| `SKIPTRACE_PROVIDER` | `batchdata` o `reiskip` | Para skip trace |
| `BATCHDATA_API_KEY` | Llave de BatchData | Si usan BatchData |
| `BATCHDATA_SKIPTRACE_URL` | Opcional, si BatchData les da otro endpoint | No |
| `REISKIP_API_KEY`, `REISKIP_API_URL` | Acceso API de REISkip (se habilita por cuenta) | Si usan REISkip |
| `GHL_WEBHOOK_URL` | Inbound webhook de un workflow de GoHighLevel | Para "Enviar al CRM" |
| `EPCOUNTY_SOURCE_URL`, `EPCOUNTY_SOURCE_KEY` | Fuente PERMITIDA de avisos: una o varias URLs separadas por coma, acepta `{YYYY}`, `{MM}`, `{YYYY-MM}`. Puede ser un PDF, una página o JSON con links a PDFs, o JSON de avisos. El robot respeta robots.txt | Para el botón "Traer avisos" y el cron |
| `EPCAD_EXPORT_URL` | URLs (.txt o .zip) de los archivos de EPCAD para que el cron semanal arme el índice | Opcional |
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
| Avisos de remate (fecha, dirección, deudores, banco, trustees, préstamo) | Notices of Trustee's Sale que se presentan en la Oficina del County Clerk de El Paso 21 días antes de la subasta del primer martes de cada mes. El condado los publica en https://apps.epcountytx.gov/publicrecords/Foreclosures | Registro público y gratis. **Ese sitio tiene un robots.txt que prohíbe el acceso automático a todo el dominio**, así que el robot NO lo raspa. Opciones: a) una persona del equipo baja los PDFs del mes desde esa página y los suelta en Importar (el lector sin llave los lee, aunque vengan en un solo paquete o escaneados); b) pedir por escrito al County Clerk el paquete mensual o un acceso masivo y poner esa URL en `EPCOUNTY_SOURCE_URL`; c) un proveedor de datos con licencia que entregue JSON. |
| Dueño, dirección postal, ausente, valor, año, metros, última escritura, homestead y mayor de 65 | EPCAD, "Property Search Dataset Downloads" en epcad.org/OpenGovernment (Deeds, Improvements, Lands, Owners, Properties, Rolls, Values; texto separado por "~") | Gratis. Se bajan, se descomprimen y se sueltan juntos en Importar > 03. Las columnas se reconocen por nombre del encabezado; no pudimos abrir el documento de layout desde aquí, así que si algún nombre no se reconoce, avísenos el encabezado y se agrega en `src/portal/parse/epcad.js`. |
| Impuestos atrasados | Oficina de impuestos de El Paso (actweb.acttax.com) y listas de venta por impuestos | Público. Botón por propiedad a la búsqueda de la oficina, e importador de listas (PDF o CSV) que une por dirección. Automatizar la consulta por cuenta requiere revisar los términos del sitio o un proveedor (TaxNetUSA). |
| Gravámenes (HELOC, juicios, mecánicos) | Registros del County Clerk o proveedor de datos | Público, pero requiere búsqueda de títulos o proveedor de pago. |
| Teléfonos y correos de dueños | Gratis: botones de búsqueda en la ficha + agregar a mano con fuente. Masivo: REISkip (cerca de $0.10 a $0.15 por registro) o BatchData (API) | Los teléfonos vienen de bases privadas; no hay forma legal de generarlos con código. Alternativas sin costo de datos: cartas y postales a la dirección postal (EPCAD) y ruta para tocar puertas. |
| Lista de No llamar | Registro nacional DNC (telemarketing.donotcall.gov) | Hay que registrarse como organización. La FTC da acceso sin costo a un número limitado de códigos de área por año; confirmar al registrarse que el 915 entra sin costo. El archivo se importa en Ajustes. |
| Valor de mercado estimado | EPCAD o AVM de un proveedor (BatchData, ATTOM) | Gratis (EPCAD) o pago (AVM). |
| CRM | GoHighLevel (IAM ya lo usa en iamrealestate.org) | Crear un workflow con trigger "Inbound Webhook" y pegar la URL en `GHL_WEBHOOK_URL`. |
| Lectura de PDFs | Lector propio sin llave (pdf.js + OCR + reglas) | Gratis. La IA es solo ayuda opcional. |

## Cumplimiento (importante antes de llamar o mandar mensajes)

* **TCPA y Do Not Call:** no llamar ni mandar SMS a números marcados DNC o litigante. Para mensajes de texto masivos se necesita consentimiento y registro A2P 10DLC en GoHighLevel. El portal tacha los DNC y los excluye del CSV de GoHighLevel.
* **Texas:** la compra de casas en remate a dueños en apuros puede caer en reglas de Texas para "foreclosure rescue" y contratos con vendedores en default. Validar guiones y contratos con su abogado.
* **Licencia:** si un agente con licencia de TREC participa, aplican las reglas de TREC (avisos IABS, publicidad). El portal es interno y no es publicidad, pero los mensajes a dueños sí cuentan.
* **Datos personales:** solo el equipo con login puede ver la información (RLS de Supabase). No exportar listas a terceros sin razón de negocio.

## Fase 2 (ideas)

* Feed automático de avisos del mes y alertas por correo o SMS al equipo cuando entra una propiedad con score 70+.
* Envío automático de las cartas por API de Lob o Click2Mail (hoy se genera el PDF y el CSV).
* Robot del condado en cuanto el County Clerk dé permiso o un acceso masivo.
* Marcador (power dialer) y secuencias de SMS en GoHighLevel conectadas al estatus.
* Comparables automáticos y oferta sugerida con la regla del 70%.
* Resultado de la subasta (vendida, pospuesta, cancelada) y seguimiento de la reventa.
* App móvil para "manejar por la zona" con mapa y fotos.
