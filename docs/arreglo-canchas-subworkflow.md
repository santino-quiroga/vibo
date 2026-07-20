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

Pegá el nodo **entero** (Ctrl+A adentro del editor, borrar, pegar). Pegar
bloques parciales dentro del código viejo deja `const`/llaves duplicados y tira
error de sintaxis.

```javascript
// Asignar cancha — elige una cancha libre para el slot, en vez de dejar
// que la elija el LLM (que no sabe cuáles hay ni cuál está ocupada).
// Search records ya trajo TODAS las reservas de este Fecha+Hora, sin las
// canceladas (su fórmula usa DATETIME_FORMAT para matchear la fecha).

const req = $('When Executed by Another Workflow').first().json;

// Canchas ya tomadas en este slot. Tolera que Airtable devuelva los campos
// planos o anidados en .fields.
const ocupadas = $('Search records').all()
  .map((i) => {
    const f = (i.json && i.json.fields) ? i.json.fields : i.json;
    return String((f && f.Cancha) || '').trim();
  })
  .filter(Boolean);

// Canchas válidas del complejo. Idealmente llega en CanchasValidas desde Vibo;
// si no, cae al fallback. CAMBIA el fallback al clonar para otro complejo.
const FALLBACK = ['Cancha 1', 'Cancha 2'];
let validas = String(req.CanchasValidas || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!validas.length) validas = FALLBACK;

// La cancha pedida es una PREFERENCIA, no una orden: el LLM la manda igual
// aunque el jugador diga "me da lo mismo". Se respeta si esta libre; si no,
// se cae a cualquier otra libre. SLOT_OCUPADO solo si no queda ninguna.
const pedida = String(req.Cancha || '').trim();
let elegida = null;
if (validas.includes(pedida) && !ocupadas.includes(pedida)) {
  elegida = pedida;
} else {
  elegida = validas.find((c) => !ocupadas.includes(c)) || null;
}

const _debug = { ocupadas, validas, pedida, elegida };

if (!elegida) {
  return [{ json: { resultado: 'SLOT_OCUPADO', cancha: null, _debug } }];
}
return [{ json: { resultado: 'OK', cancha: elegida, _debug } }];
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

## PASO 5 — Que la cantidad de canchas venga de Vibo (mejora)

Hoy la cantidad de canchas está en dos constantes: `FALLBACK` en `Asignar cancha`
y `TOTAL_CANCHAS` en `get_availability`. Funciona, pero hay que acordarse de
tocarlas al clonar para otro complejo, y si en Vibo se agrega una cancha, n8n no
se entera. Esta mejora hace que salga de Vibo (que ya sabe cuántas canchas tiene
cada agente), así no se toca nunca más. Son 4 ediciones en n8n; ninguna en Vibo.

**5a. Nodo `Vibo - Contexto cache` (parent) — exponer la lista.** En el `return`
final (el del camino OK, no el del `if (!ctx)`), agregar dos campos:

```javascript
    canchasValidas: (Array.isArray(ctx.canchas) ? ctx.canchas.map((x) => 'Cancha ' + x.numero).join(',') : ''),
    totalCanchas: (Array.isArray(ctx.canchas) ? ctx.canchas.length : 0),
```

(El `ctx` ya lo tiene: es la respuesta de `/contexto`. En el fallback sin ctx
quedan vacío/0, y los subworkflows caen a su default — fail-open correcto.)

**5b. Tool `create_booking_safe` (parent) — pasar la lista.** Agregar un input
`CanchasValidas`, mapeado a una **expresión fija** (NO `$fromAI` — esto no lo
decide el modelo):

```
={{ $('Vibo - Contexto cache').first().json.canchasValidas }}
```

El nodo `Asignar cancha` ya lee `req.CanchasValidas`, así que no hay que tocarlo.

**5c. Tool `get_availability` (parent) — pasar el total.** Agregar un input
`TotalCanchas`, también expresión fija:

```
={{ $('Vibo - Contexto cache').first().json.totalCanchas }}
```

**5d. Nodo `merge_slots` (subworkflow get_availability).** Cambiar la constante
por la lectura del input, con la constante de respaldo por si llega 0/vacío
(Vibo caído):

```javascript
const TOTAL_CANCHAS = Number($('When Executed by Another Workflow').first().json.TotalCanchas) || 2;
```

Con esto, agregar/quitar una cancha en Vibo se refleja solo, y clonar para otro
complejo no requiere tocar código n8n. El `|| 2` y el `FALLBACK` del Code quedan
como red: si Vibo no responde, el bot sigue con un default razonable en vez de
cortar.

**Probar 5:** cambiá temporalmente las canchas del agente en Vibo (agregá una 3ra
en Agentes → Canchas), mandá un mensaje, y confirmá en el `_debug` de
`Asignar cancha` que `validas` trae las 3. Volvé a dejarlo en 2 después.

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
