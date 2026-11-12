# I AM Real Estate · Propuesta de sitio unificado

Propuesta de ZERONNE para unir **iamrealestate.co** (WordPress, "I Am Real Estate") e **iamrealestate.org** (GoHighLevel, "IAM Investments") en una sola marca, un solo sitio y un solo embudo de leads.

Stack: Vite + JavaScript vanilla + three.js. Funciones serverless en `/api` para Vercel. Sin frameworks pesados: el HTML carga rápido y three.js solo se descarga cuando el usuario llega al tour 3D.

## Qué incluye

| Sección | Qué hace |
| --- | --- |
| Hero + selector de camino | Comprar / Vender / Invertir. Cada pestaña cambia el formulario y lleva al módulo correcto con datos precargados. |
| Tour 3D inmersivo | Casa de una planta estilo El Paso (estuco, parapetos, zaguán) hecha 100% con código. Maqueta en corte, pines por cuarto, vuelo de cámara a sala, cocina, recámara, baño y patio, modo caminar (WASD / flechas / arrastrar, botones táctiles en celular), luz de día, atardecer y noche, amueblado virtual on/off y medidas del cuarto al tocar el piso (pies y metros). |
| Propiedades | Grid con filtros (tipo, zona, recámaras, precio), modal con galería, pago mensual estimado y botón "Recorrer en 3D". Son propiedades **demo** con calles ficticias. |
| Oferta en efectivo con IA | Formulario de 4 pasos que genera una hoja comparativa: oferta en efectivo vs venta en el mercado (rango, comisiones, cierre, reparaciones, días). Marcado como estimado, no oferta. Envía el lead. |
| Inversión / JV | Analizador de flips en vivo (ganancia, ROI, anualizado, regla del 70%) + explicación del joint venture + formulario de inversionista. |
| Administración y rentas | Formularios para propietarios (propuesta de administración) e inquilinos (solicitud de renta). |
| Asistente IAM | Chat bilingüe que califica y canaliza al departamento correcto (Compras, Ventas, Inversionistas, Administración, Rentas). Funciona con flujo guiado sin API; con API usa IA real. |
| Nosotros, equipo, FAQ, contacto | Datos reales de la empresa, jerarquía de teléfonos, espacios para reseñas reales (no se inventan testimonios). |
| SEO | JSON-LD `RealEstateAgent` + `LocalBusiness`, OG/Twitter, hreflang EN/ES, `?lang=es`. |
| Bilingüe | Botón EN/ES, se recuerda la preferencia. Todo el texto vive en `src/i18n.js`. |

## Estructura

```
index.html            Página completa (markup con data-i18n)
src/main.js           Arranque, navegación, selector de camino, carga diferida del 3D
src/i18n.js           Diccionario EN/ES y cambio de idioma
src/config.js         URL de leads, teléfonos y supuestos del estimador  <- EDITAR
src/tour3d.js         Escena three.js procedural
src/listings.js       Propiedades demo, filtros y modal
src/cashoffer.js      Estimador de oferta en efectivo y hoja comparativa
src/invest.js         Analizador de flips
src/chat.js           Asistente IAM (guiado + IA opcional)
src/leads.js          Envío de leads a Google Apps Script
api/chat.js           Función Vercel para el asistente con IA
apps-script/Code.gs   Receptor de leads en Google Sheets + correo por departamento
public/img            Fotos (Unsplash, licencia libre) en webp
```

## Correr local

```bash
npm install
npm run dev        # desarrollo
npm run build && npm run preview
```

## Deploy en Vercel

1. Importar el repo en Vercel. Framework: Vite (se detecta solo). Build `npm run build`, output `dist`.
2. Variables de entorno (Settings > Environment Variables), opcionales:
   - `ANTHROPIC_API_KEY` y opcional `ANTHROPIC_MODEL` (por defecto `claude-haiku-5-5`), **o**
   - `GEMINI_API_KEY` y opcional `GEMINI_MODEL` (por defecto `gemini-2.5-flash`).
   Sin llaves, `/api/chat` responde 501 y el asistente usa el flujo guiado automáticamente.
3. Apuntar el dominio final (recomendado: dejar `iamrealestate.co` como principal y redirigir `iamrealestate.org` con 301).

## Leads a Google Sheets (Apps Script)

1. Crear una Google Sheet nueva > Extensiones > Apps Script.
2. Pegar `apps-script/Code.gs`. Cambiar los correos de `DEPARTMENTS` (Ventas, Compras, Administración, Inversionistas).
3. Implementar > Nueva implementación > Aplicación web > Ejecutar como: yo > Acceso: cualquier usuario.
4. Copiar la URL `/exec` en `src/config.js` > `LEAD_ENDPOINT` y volver a hacer deploy.

Cada tipo de lead cae en su pestaña (Cash offers, Buyers, Investors, Management, Rentals, Contact, Assistant), las columnas se crean solas y se manda un correo al departamento. Mientras `LEAD_ENDPOINT` esté vacío el sitio está en **modo demo** (el lead se imprime en consola y se muestra un aviso).

## Supuestos del estimador (EDITAR CON NÚMEROS REALES DE IAM)

En `src/config.js > OFFER`: precio por pie² de El Paso (ARV), factor por condición, costo de reparación por pie², porcentaje del ARV que paga el inversionista, comisión, gastos de cierre, costo mensual de mantener la casa y días típicos de cierre. Hoy son valores de referencia, no datos de IAM.

## Conectar tours reales (Matterport o Gaussian splat)

El modelo procedural es la demo. Para cada propiedad real:

- **Matterport**: agregar a la propiedad un campo `tourUrl` con el link `https://my.matterport.com/show/?m=XXXX` y renderizar en el espacio `#scanSlot` (o en el modal) un `<iframe src="...&play=1&qs=1" allow="xr-spatial-tracking; fullscreen">`.
- **Gaussian splat** (grabado con celular en Polycam, Luma o Scaniverse): exportar `.ply` o `.splat`, subirlo a `public/tours/` o a un bucket, e instalar `@mkkellogg/gaussian-splats-3d`. Se crea un `Viewer` dentro del mismo canvas y se reutilizan los botones de cuartos guardando una posición de cámara por cuarto.
- Los controles actuales (cuartos, luz, medidas) se pueden mantener como capa encima del tour real.

## Conectar inventario real e IDX / MLS

`src/listings.js` exporta `LISTINGS`. Para producción:

1. Inventario propio de IAM (flips, rentas): una Google Sheet publicada como JSON o un CMS ligero, leído con `fetch` al cargar.
2. MLS de El Paso (GEPAR): contratar un proveedor IDX con API (por ejemplo un feed RESO Web API) y crear `/api/listings` en Vercel que traiga y cachee las propiedades. Respetar las reglas de atribución del MLS en las tarjetas.

## Pendientes antes de publicar

- Quitar la franja "Proposal preview" (`.ribbon` en `index.html`).
- Ligar los avisos TREC del footer a los formularios completados de la correduría (Information About Brokerage Services y Consumer Protection Notice).
- Links reales de Facebook e Instagram, aviso de privacidad y términos.
- Sustituir propiedades demo por inventario real y fotos propias.
- Cargar reseñas reales de Google en los espacios de testimonios.

## Portal del equipo

Sistema interno de remates, leads, inventario y estados de hipoteca en `/portal`. Ver `docs/PORTAL_README.md`.
