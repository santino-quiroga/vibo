# Arreglo del subworkflow de reservas — asignación de cancha robusta

## Qué está mal hoy (4 defectos)

0. **`Search records` no encontraba NINGUNA reserva** (el más grave, detectado al
   probar). La fórmula comparaba `{Fecha} = '2026-07-21'`, pero `Fecha` es un campo
   de tipo fecha en Airtable (guarda ISO, `2026-07-21T00:00:00.000Z`), y `=` contra
   un string da falso casi siempre. Devolvía vacío en cada llamada → el chequeo de
   solapamiento no veía nada → **sobreventa**: se podía reservar el mismo slot
   infinitas veces. Se ve como "la 3ra reserva del mismo horario dio Cancha 1 en
   vez de SLOT_OCUPADO".
   **Fix:** en `Search records`, cambiar la primera condición del filterByFormula a
   `DATETIME_FORMAT({Fecha}, 'YYYY-MM-DD') = '{{ $input.first().json.Fecha }}'`.
   Fórmula completa:
   ```
   =AND(DATETIME_FORMAT({Fecha}, 'YYYY-MM-DD') = '{{ $input.first().json.Fecha }}', {Hora inicio} = '{{ $input.first().json.Hora_inicio }}', NOT({Estado} = 'Cancelada'))
   ```
1. **El chequeo de solapamiento ignoraba la cancha.** Filtraba por `Fecha` +
   `Hora inicio` sin mirar `Cancha`, y el `If` sólo creaba si la búsqueda volvía
   vacía. (Moot mientras el defecto 0 hacía que volviera vacía siempre, pero hay que
   arreglar los dos.) La lógica correcta la resuelve el nodo `Asignar cancha`: mira
   qué canchas del slot están ocupadas y asigna una libre.
2. **Typecast encendido** dejaba entrar "Cualquiera" como opción nueva del select.
   OJO: NO se apaga — lo necesita el campo Fecha (ver Paso 1). El freno real es el
   nodo `Asignar cancha`, que garantiza un valor de cancha válido.
3. **La cancha la elegía el LLM**, que no tiene ninguna tool que le diga qué canchas
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

- En Airtable, tabla Reservas, campo `Cancha`: **borrá la opción "Cualquiera"**.
- Arreglá a mano la reserva que quedó en "Cualquiera" (asignale Cancha 1 o 2).

> **Sobre el typecast — corrección.** La primera versión de este doc decía
> "apagá el typecast" acá. **No lo apagues** (o volvé a encenderlo): el campo
> `Fecha` de Airtable es de tipo fecha y necesita el typecast para parsear el
> string `"2026-07-21"` — sin él, `Create a record` falla con *"Field Fecha
> cannot accept the provided value"*.
>
> El typecast NO es el freno contra el "Cualquiera": ese freno es el nodo
> `Asignar cancha` del Paso 2, que garantiza que `Cancha` sea siempre un valor
> válido de la lista. Con ese nodo puesto, el LLM ya no escribe el campo, así que
> el typecast no puede inventar opciones de cancha. Dejá el typecast **ON**.

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

El nombre del nodo tiene que coincidir **exacto** con `$('Asignar cancha')` —
n8n lo crea como "Code"/"Code1", hay que renombrarlo. Y **Typecast queda ON**
(ver la nota del Paso 1: lo necesita el campo Fecha; la cancha ya la valida el
nodo Code).

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
