# Umbrathel web

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
| Esc | Cerrar paneles |

## Publicar una versión

Crea una release en GitHub con un tag tipo `v0.3.0`; el navegador la detectará desde
Personalizar → Actualizaciones.
