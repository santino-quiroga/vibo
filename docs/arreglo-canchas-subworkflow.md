# Arreglo del subworkflow de reservas — asignación de cancha robusta

## Qué está mal hoy (3 defectos)

1. **El chequeo de solapamiento ignora la cancha.** `Search records` filtra por
   `Fecha` + `Hora inicio` + no-cancelada, sin mirar `Cancha`. El `If` sólo crea
   si esa búsqueda vuelve vacía. Resultado: **una reserva en Cancha 1 a las 20:00
   hace que el bot rechace la Cancha 2 a las 20:00 aunque esté libre** → se pierde
   la mitad de la capacidad.
2. **Typecast encendido** en `Create a record` (`options.typecast = true`). Por eso
   "Cualquiera" se guardó como opción nueva del select en vez de fallar. Contradice
   el checklist de activación.
3. **La cancha la elige el LLM**, que no tiene ninguna tool que le diga qué canchas
   existen ni cuál está libre. De ahí "Cualquiera".

## La idea del arreglo

La cancha deja de elegirla el modelo. El subworkflow, que es donde la asignación
es atómica con la reserva, mira qué canchas están ocupadas en ese slot y asigna
la primera libre. `Search records` ya devuelve todas las reservas del slot (de
todas las canchas), así que **su fórmula no se toca** — lo que estaba mal era
usar "existe alguna" como "slot lleno".

Flujo nuevo:

```
When Executed → Search records → [Asignar cancha (Code, NUEVO)]
  → If (resultado == 'OK')
      true  → Create a record (typecast OFF, Cancha = la que asignó el Code)
            → Edit Fields1 (éxito)
      false → Edit Fields (SLOT_OCUPADO)
```

Sólo se agrega **un** nodo Code, se cambia la condición del `If`, se re-apunta el
campo `Cancha` del `Create`, y se apaga el typecast. Los dos `Set` de mensaje se
reusan tal cual.

---

## PASO 1 (urgente, hacé esto ya)

Sin tocar el diseño, frena el sangrado:

- `Create a record` → **Options → Typecast: OFF**.
- En Airtable, tabla Reservas, campo `Cancha`: **borrá la opción "Cualquiera"**.
- Arreglá a mano la reserva que quedó en "Cualquiera" (asignale Cancha 1 o 2).

Con typecast off, un valor mal formado vuelve a dar error visible (422) en vez de
inventar una opción.

---

## PASO 2 — Nodo Code "Asignar cancha"

Insertar **entre** `Search records` y el `If`. Tipo: Code (Run Once for All Items).

```javascript
// Asigna la cancha libre para el slot, en vez de dejar que la elija el LLM.
//
// Search records ya trajo TODAS las reservas de este Fecha+Hora (de cualquier
// cancha, sin las canceladas). De ahí sale qué canchas están ocupadas.

const req = $('When Executed by Another Workflow').first().json;

// Canchas ya tomadas en este slot.
const ocupadas = $('Search records').all()
  .map((i) => String(i.json.Cancha || '').trim())
  .filter(Boolean);

// Lista de canchas válidas del complejo. Idealmente llega desde Vibo en el
// input CanchasValidas ("Cancha 1,Cancha 2"); si no llegó, cae al fallback.
// CAMBIÁ el fallback al clonar este workflow para otro complejo — o mejor,
// cableá CanchasValidas desde Vibo (ver PASO 5) y no toques esto nunca más.
const FALLBACK = ['Cancha 1', 'Cancha 2'];
let validas = String(req.CanchasValidas || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
if (!validas.length) validas = FALLBACK;

const pedida = String(req.Cancha || '').trim();
const pedidaEsValida = validas.includes(pedida);

let elegida = null;
if (pedidaEsValida) {
  // El jugador pidió una puntual: se respeta sólo si está libre.
  if (!ocupadas.includes(pedida)) elegida = pedida;
} else {
  // Sin preferencia (o basura tipo "Cualquiera"): la primera libre.
  elegida = validas.find((c) => !ocupadas.includes(c)) || null;
}

if (!elegida) {
  return [{ json: { resultado: 'SLOT_OCUPADO', cancha: null } }];
}
return [{ json: { resultado: 'OK', cancha: elegida } }];
```

---

## PASO 3 — Cambiar la condición del `If`

Hoy compara `{{ $json.id }}` is empty. Cambiar a:

- **Value 1:** `{{ $json.resultado }}`
- **Operation:** equals (string)
- **Value 2:** `OK`

La rama **true** sigue yendo a `Create a record`; la **false** a `Edit Fields`
(el mensaje de SLOT_OCUPADO). No hay que recablear conexiones.

---

## PASO 4 — Re-apuntar el campo `Cancha` del `Create a record`

Hoy: `={{ $('When Executed by Another Workflow').first().json.Cancha }}` (lo que
mandó el LLM). Cambiar a la cancha que asignó el Code:

```
={{ $('Asignar cancha').first().json.cancha }}
```

Y confirmá de nuevo que **Typecast está OFF** en ese nodo.

---

## PASO 5 (recomendado) — Que la lista de canchas venga de Vibo

Para no depender del fallback hardcodeado y respetar que Vibo es la fuente de
verdad: en el workflow PADRE (PadelAI), en el tool `create_booking_safe`, agregá
un input `CanchasValidas` mapeado a una expresión que arme la lista desde el
contexto de Vibo. Con eso, agregar o quitar una cancha en Vibo se refleja solo,
sin tocar n8n. (Si preferís, dejá el fallback del Code por ahora y esto queda
para después — el arreglo funciona igual.)

---

## PASO 6 — Probar en una COPIA antes de producción

Este subworkflow graba turnos reales. Duplicalo y probá:

1. Reservá el mismo Fecha+Hora dos veces → debe asignar una cancha y después la
   otra (da igual el orden).
2. Reservá una tercera vez el mismo slot → `SLOT_OCUPADO`.
3. Pedí "me da lo mismo" → asigna una válida, nunca "Cualquiera".
4. Pedí "Cancha 2" con la 2 libre → usa la 2; con la 2 tomada y la 1 libre →
   el Code de arriba da SLOT_OCUPADO (pidió una puntual y no está).

Verificá **leyendo el registro en Airtable**, no si la ejecución dio verde.

---

## Nota sobre solapamiento de 90 min

La fórmula compara `Hora inicio` exacto. Como los turnos salen de una grilla fija
(tabla Configuracion) y **siempre duran 90 min**, dos turnos de la misma cancha
sólo chocan si arrancan a la misma hora — así que el match exacto alcanza. Si en
algún momento se permiten horarios de inicio libres (no de grilla), esto habría
que revisarlo: un 20:00 y un 21:00 se solaparían y el match exacto no lo vería.
