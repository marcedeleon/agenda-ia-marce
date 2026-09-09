# Onboarding: WhatsApp Business Cloud API

Guía paso a paso para conectar la **API oficial de WhatsApp (Meta)** al bot. Estos pasos se hacen
una sola vez en el portal de Meta y requieren documentación de tu negocio/identidad. Mientras tanto,
el código puede quedar listo para recibir el webhook.

> ¿Tenés dudas con los términos? (WABA, System User, template) — cada uno se explica abajo.
> Documentación oficial: https://developers.facebook.com/docs/whatsapp/cloud-api

---

## 0. Lo que necesitás antes de empezar

- Un correo que puedas verificar y una **cuenta de Facebook** (no tiene que ser personal).
- Un **número de teléfono real** que usarás como el número del bot (no puede estar ya
  registrado en WhatsApp como tu número personal — necesitás uno disponible).
- Los **dos números personales** que le escribirán al bot (con país y sin `+`, ej. `54911...`).
  En modo _test_ pueden recibir mensajes del bot hasta 5 números.

---

## 1. Crear la cuenta y la app de negocio

1. Entrá a https://developers.facebook.com → **Comenzar** → creá la **cuenta de desarrollador**
   (te pedirá verificar teléfono/correo).
2. Andá a **My Apps → Create App**.
   - Tipo: **Business**.
   - Conectá o creá un **Business Portfolio** (es lo que Meta llama "empresa"; puede ser un
     nombre ficticio para desarrollo).
3. Dentro de la app recién creada, en **Add products** → agregá **WhatsApp**.
4. Verás la pantalla **API Setup** con un campo para conectar un número:
   - Ingresá el número que será el bot.
   - Te llegará un **código por WhatsApp/SMS al celular** → ingresalo.
   - Configurá un **PIN de 2 pasos** para el número (lo vas a necesitar).

---

## 2. Anotar los identificadores (van en `.env`)

En la pestaña **API Setup** quedan estos valores (los necesitás después):

| Dato                  | Dónde está en la consola               | Variable de `.env`        |
| --------------------- | -------------------------------------- | ------------------------- |
| Token (permanente)    | API Setup → **Access Token**           | `META_WA_TOKEN`           |
| Teléfono ID           | API Setup → **Phone number ID**        | `WA_PHONE_NUMBER_ID`      |
| Token de verificación | elegilo **vos** (string largo secreto) | `WA_WEBHOOK_VERIFY_TOKEN` |

### Generar un _access token_ permanente (recomendado)

El token de API Setup expira. Para uno permanente:

1. **Business Manager** → **Users → System users** → _Add_.
2. Rol: **Admin** → asignar la app agregada al System User.
3. **Generate new token** → elegir la app y el permiso `whatsapp_business_messaging`.
4. Copiar ese token (solo se muestra una vez).

Ese token va en `META_WA_TOKEN`. **Jamás en el repositorio.**

---

## 3. Los 2 números que usarán la agenda

En **API Setup → "To" (Test number)**: agregá los dos números personales (con código de país y
sin `+`). Cuando pruebes el bot en local, los mensajes que mandes desde ahí llegarán al webhook.

Escribí esos dos números en `.env`:

```
AGENDA_OWNERS_WHATSAPP=5491100000000,5491100000001
```

El bot solo procesa mensajes de números en esa lista (whitelist).

---

## 4. Configurar el webhook

El bot expone el endpoint `GET/POST /webhook/whatsapp`.

1. Necesitás una **URL pública HTTPS** que apunte a tu servidor en desarrollo.
   - Opción rápida: `npx ngrok http 3000` (Webhook URL sería `https://TU-TUNEL.ngrok.io/webhook/whatsapp`).
2. En la app de Meta: **Configuration → Webhook → Edit**.
3. **Callback URL**: `https://TU-URL/webhook/whatsapp`
4. **Verify token**: exactamente el mismo valor que pusiste en `WA_WEBHOOK_VERIFY_TOKEN`.
5. Campo a suscribirse: `messages`. Guardar y verificar (Meta hace un GET con `hub.challenge`).

Cuando esté listo, Meta mandará cada mensaje nuevo como POST `/webhook/whatsapp`.

---

## 5. Template para el resumen diario

Para mandar el resumen diario **fuera de la ventana de 24hs** (el caso típico: el bot te escribe
a la mañana), WhatsApp exige un **template aprobado** por Meta.

- **App → WhatsApp → Message Templates → Create**.
- Ejemplo:
  - Name: `recordatorio_diario`
  - Language: `es_AR`
  - Body: `Hola {{1}}, hoy tenes {{2}}. `📍 Podes preguntarme "¿qué hay mañana?"`
- El template pasa por revisión (horas/días). Las respuestas dentro de las 24hs del último
  mensaje del usuario **no requieren template** (respuesta en conversación abierta).

---

## 6. Pasar de test a producción

- El **Business Portfolio** debe estar **verificado** (documentación: CUIT/nombre legal).
- El número del bot debe estar **habilitado** (2 pasos ya configurados).
- Subir el servidor a un host público 24/7 (Railway, Render, Fly.io, VPS...).
- Cambiar el webhook URL del placeholder del túnel por la URL real.

---

## Checklist

- [ ] Cuenta de desarrollador de Meta creada.
- [ ] App Business + producto WhatsApp agregado.
- [ ] Número del bot conectado y con PIN de 2 pasos.
- [ ] `META_WA_TOKEN`, `WA_PHONE_NUMBER_ID` y `WA_WEBHOOK_VERIFY_TOKEN` en `.env`.
- [ ] Acceso a Gemini: `GEMINI_API_KEY` (https://aistudio.google.com → Get API key).
- [ ] Webhook apuntando al endpoint `/webhook/whatsapp` (túnel o producción).
- [ ] Los 2 números personales agregados en test y en `AGENDA_OWNERS_WHATSAPP`.
- [ ] Template `recordatorio_diario` aprobado.
- [ ] Espacio en `.env` para `DATABASE_URL` apuntando al Postgres final (el del proyecto o uno
      de producción tipo Neón/Railway).

---

## Referencia de variables de `.env`

| Variable                  | Uso                                           |
| ------------------------- | --------------------------------------------- |
| `META_WA_TOKEN`           | Header `Authorization: Bearer` a la Cloud API |
| `WA_PHONE_NUMBER_ID`      | Id del número del bot (sender)                |
| `WA_WEBHOOK_VERIFY_TOKEN` | Verificación del webhook (GET)                |
| `AGENDA_OWNERS_WHATSAPP`  | whitelist de números (máx. 2)                 |
| `DAILY_REMINDER_TIME`     | Hora del resumen diario (HH:MM)               |
| `GEMINI_API_KEY`          | Clave de Google AI Studio                     |
| `DATABASE_URL`            | Conexión a PostgreSQL                         |
