# Umbrathel Web

Navegador de escritorio construido sobre Chromium (Electron), con estética Liquid Glass
(vibrancy nativa de macOS), pestañas múltiples, marcadores, historial y una pantalla de
inicio totalmente personalizable.

![Icono](assets/icon.png)

## Características

- **Motor Chromium** real vía Electron, con una `WebContentsView` aislada y sandboxed por pestaña.
- **Diseño Liquid Glass**: ventana sin barra de título, translucidez sobre el escritorio,
  contenido flotante con esquinas redondeadas y animaciones spring.
- **Pantalla de inicio personalizable**: accesos rápidos propios (título, web e icono con
  imágenes de tu ordenador), fondo por color / degradado / imagen, y el escudo de Umbrathel
  como fondo por defecto.
- **Bordes de navegación personalizables** con los colores que elijas, y color de acento propio.
- **Apps ancladas**: cualquier web (Discord, un Dynmap/BlueMap, una wiki de tratados…) se
  puede fijar en un panel acoplado a la derecha, con varias abiertas a la vez si hace falta.
  Sigue viva en segundo plano (voz incluida) aunque el panel esté cerrado, y alterna entre
  compacto y amplio con ⌘⇧D. Se ensancha sola en pantallas de login estrechas (p. ej. Discord).
- **Grupos de pestañas**: clic derecho para agrupar, doble clic en la etiqueta para renombrar,
  clic para colapsar/expandir.
- **Perfiles**: sesiones completamente separadas (cookies, marcadores, historial, ajustes)
  para distintas cuentas o facciones, con cambio rápido desde la esquina superior izquierda.
- **Notas rápidas**: panel de notas persistente para coordenadas, tratados o lo que haga falta.
- **Servidores de Minecraft**: estado en vivo (online/offline, jugadores) y copia de IP con
  un clic, en la propia pantalla de inicio.
- **Marcadores e historial** persistentes (por perfil).
- **Actualizaciones automáticas de verdad**: en Windows y Linux se descargan e instalan sin
  salir de la app; en macOS (sin firma de Apple) se descargan dentro de la app y se abren
  listas para arrastrar a Aplicaciones.

## Desarrollo

```bash
npm install
npm start
```

## Atajos

| Atajo | Acción |
| --- | --- |
| ⌘T | Nueva pestaña |
| ⌘L | Foco en la barra de direcciones |
| ⌘R | Recargar |
| ⌘⇧D | Panel acoplado: alternar entre ancho y compacto |
| Esc | Cerrar paneles |
| Clic derecho en pestaña | Agrupar / quitar de grupo |

## Publicar una versión

```bash
GH_TOKEN=$(gh auth token) npx electron-builder --mac --win --linux --publish always
```

Esto construye y sube binarios + metadatos de actualización en un solo paso (evita el bug
de nombres que da subir los archivos a mano). El navegador detectará la nueva versión desde
Personalizar → Actualizaciones.

### Regla de oro: nunca reutilices un tag de versión

`electron-builder --publish always` crea la release como **borrador** y solo la publica
(no-draft) si el proceso entero termina sin errores. Con builds multiplataforma largas
(mac + win + linux, ~15-20 min) es fácil que algo falle a mitad — hemos visto un bug propio
de electron-builder donde subir el `.zip` de x64 y arm64 en paralelo choca con GitHub
("already_exists") y tira todo el proceso. Si eso pasa, **NO** intentes arreglarlo borrando
y republicando bajo el mismo tag: eso deja duplicados o releases fantasma en borrador,
invisibles para `/releases/latest` y por tanto para el comprobador de actualizaciones —
exactamente lo que pasó con v0.4.0 y casi pasa dos veces con v0.5.0.

**En vez de eso: sube el número de versión (p. ej. `0.5.0` → `0.5.1`) y publica limpio con
ese tag nuevo.** Un tag nunca usado nunca puede chocar con nada. Solo borra una release si
de verdad hace falta (y entonces borra también su tag con `--cleanup-tag`), nunca para
"reintentar" la misma versión.

Si aun así una publicación se queda a medias, para diagnosticar:

```bash
# ¿Hay releases duplicadas o en borrador con el mismo tag?
gh api repos/carontumrotumero/umbrathel-web/releases --jq '.[] | {id, tag_name, draft}'

# ¿Le faltan los .yml de metadatos de actualización? (si faltan, el build murió
# antes de generarlos — no vale con solo re-subir binarios)
gh release view vX.Y.Z --json assets --jq '.assets[] | select(.name | endswith(".yml"))'
```

## Limitaciones conocidas

**Llaves de seguridad físicas y Touch ID (WebAuthn) no funcionan.** No es un bug de este
proyecto: Electron no implementa el ciclo de `navigator.credentials` de forma nativa
([electron/electron#24573](https://github.com/electron/electron/issues/24573), abierto
desde 2020, sigue sin resolverse en el núcleo). Se reproduce igual en un sitio de pruebas
neutral (webauthn.io), sin nada específico de Discord de por medio.

Arreglarlo requeriría integrar un módulo nativo de la comunidad (p. ej.
[`electron-webauthn`](https://github.com/iamEvanYT/electron-webauthn)) y, para que
funcione en *cualquier* web (no solo dominios propios), Apple exige el entitlement
`com.apple.developer.web-browser.public-key-credential` — una capacidad gestionada que
hay que solicitarle directamente a Apple (igual que Chrome o Firefox), no basta con pagar
la cuenta de desarrollador. Se descartó por desproporcionado para un proyecto personal.

**Mientras tanto:** usa el login por código QR o usuario/contraseña, que funcionan sin
problema en Discord y en cualquier otro sitio.
