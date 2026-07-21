# Roadmap maestro — de hoy al lanzamiento público

**Objetivo:** una sola línea de tiempo que ordena los otros 6 documentos, con hitos
verificables y una fecha de lanzamiento público realista.

**Responsable:** los dos. Santino es dueño del roadmap técnico; el socio, del
comercial/marca. La revisión semanal (ver `kpis-ciclo-revision.md`) es el momento de
ajustarlo.

**Decisiones ya tomadas (21/07/2026):** piloto sobre Evolution API sin retrasos, con
mitigaciones; piloto **pago con descuento**; número de WhatsApp a elección del cliente
(dedicado o el del complejo) — el tráfico es 100% reactivo y Vibo no ofrece campañas
masivas, que es donde aparece el riesgo de ban.

---

## Principio rector

Las dos pistas corren **en paralelo desde la Semana 1**: el hardening técnico no
bloquea la construcción de marca ni la prospección. Lo único que sí bloquea: **no se
activa un cliente real hasta cerrar las deudas de seguridad** (auditoría, sección 3,
ítems 1–3) — es decir, no antes del lun 28 jul.

## Línea de tiempo

### Semana 1 · mar 21 – dom 26 jul — Hardening + arranque de marca
- **Santino:** rotar los 3 secretos expuestos; TLS delante de Evolution; token de
  integración a credencial Header Auth (un nodo por vez, verificando); monitor de
  uptime con alertas; `ENCRYPTION_KEY` al gestor de contraseñas de los dos.
- **Socio:** leer `brief-marca-posicionamiento.md`, validar/ajustar propuesta de
  valor y tono; armar lista de 30–50 complejos objetivo (empezar por conocidos y
  zona propia); abrir/ordenar el Instagram de Vibo.
- **Hito de cierre:** checklist de seguridad en verde. Lista de prospectos ≥ 30.

### Semana 2 · lun 27 jul – dom 2 ago — Onboarding estándar + demo lista
- **Santino:** aplicar Paso 5 (canchas desde Vibo); ejecutar el runbook de
  `onboarding-limites-soporte.md` completo con un **cliente fantasma** (alta de cero,
  cronometrada) y corregir el runbook con lo que salga; dejar a Padel AI como **sede
  demo permanente** (decisión: no se borra; es la demo en vivo).
- **Socio:** identidad visual aplicada (perfil, plantillas); grabar la primera demo
  en video (pantalla del teléfono reservando); primeros 2 posts.
- **Hito de cierre:** onboarding de un cliente nuevo ≤ 1 día de trabajo efectivo,
  documentado. Demo reproducible en el teléfono de cualquiera.

### Semana 3 · lun 3 – dom 9 ago — Salir a vender
- **Los dos:** primeras reuniones/visitas con demo en vivo (guión en
  `estrategia-comercial-demo.md`). Objetivo: **≥ 5 demos dadas**.
- **Santino:** cerrar Mercado Pago producción (access token, webhook secret, 3 planes
  creados, prueba sandbox → AL_DIA). Si MP sigue trabado, el piloto se cobra por
  transferencia + "Marcar como pagado" manual — MP no bloquea la venta.
- **Socio:** cadencia de contenido (2–3 posts/semana) + prospección directa por
  Instagram/WhatsApp.
- **Hito de cierre:** 5 demos, ≥ 1 propuesta de piloto entregada.

### Semana 4 · lun 10 – dom 16 ago — Primer cliente piloto
- **Hito central: primer piloto firmado y onboardeado** (precio piloto: ver
  `pricing-unit-economics.md`). Onboarding cronometrado contra el runbook.
- **Santino:** acompañamiento diario del piloto la primera semana; chip de respaldo
  comprado y calentándose.
- **Socio:** documentar el proceso en contenido ("así se suma un complejo").

### Semanas 5–6 · lun 17 – dom 30 ago — Piloto operando + clientes 2 y 3
- Piloto 1 en régimen: medir KPIs de `kpis-ciclo-revision.md` (conversión
  conversación→reserva, reservas fuera de horario, handoffs).
- Seguir dando demos: objetivo **2–3 pilotos activos al 30 de ago**.
- Primer testimonio del piloto 1 (audio/video corto del dueño).
- **Hito de cierre:** ≥ 2 clientes pagando, 0 incidentes sin detectar por el monitor.

### Semanas 7–8 · lun 31 ago – dom 13 sep — Caso de éxito + preparación de lanzamiento
- Caso de éxito escrito con números reales (X reservas/mes por el bot, Y% fuera de
  horario) — insumo central del lanzamiento.
- Landing pública con la demo y el caso (hoy no hay sitio comercial).
- Retro del ciclo (primera revisión mensual profunda): pricing, límites de soporte y
  veredicto Evolution se revisan con datos.

### Lun 14 sep 2026 — **Lanzamiento público**
Condición de salida (no es una fecha ciega): ≥ 1 caso de éxito con números + ≥ 2
clientes pagando + onboarding ≤ 1 día probado 3 veces. Si el 7 de sep no se cumple,
el lanzamiento se corre — se lanza con prueba social o no se lanza.

## Qué NO entra hasta después del lanzamiento

Para proteger el foco (y porque el soporte a medida es el riesgo n.º 1 de un equipo
de 2): Instagram como canal del bot, migración a Meta Cloud API, VPS redundante,
otros deportes/verticales, features a pedido de un solo cliente. Todo eso va al
backlog con el proceso de `onboarding-limites-soporte.md`, sección "Límites".

## Dependencias entre documentos

```
auditoria-tecnica-riesgo (S1–S2)
   └─ habilita → estrategia-comercial-demo (S3+) ── usa → pricing-unit-economics
                     └─ produce pilotos → onboarding-limites-soporte (S2, se prueba S4)
brief-marca-posicionamiento (S1–S6, paralelo)
kpis-ciclo-revision (desde S4, con datos reales)
```
