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
- **Panel rápido de Discord**: acoplado a la derecha, con voz en segundo plano aunque esté
  cerrado, y dos tamaños (voz compacto / escribir amplio) que se alternan con ⌘⇧D.
- **Marcadores e historial** persistentes.
- **Comprobador de actualizaciones** contra GitHub Releases.

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
| ⌘⇧D | Discord: alternar entre panel de escribir (amplio) y de voz (compacto) |
| Esc | Cerrar paneles |

## Publicar una versión

Crea una release en GitHub con un tag tipo `v0.3.0`; el navegador la detectará desde
Personalizar → Actualizaciones.

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
