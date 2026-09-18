# Archivo — un "Drive" estático para GitHub Pages

Una mini app de tipo Drive (carpetas, arrastrar y soltar archivos, descarga, renombrar,
borrar) hecha con HTML/CSS/JS puro. No necesita build, framework ni backend.

## ⚠️ Cómo funciona el almacenamiento

GitHub Pages solo sirve archivos estáticos: no hay servidor ni base de datos.
Esta app guarda todo en **IndexedDB, dentro del propio navegador que la visita**.
Eso significa:

- Los archivos y carpetas persisten entre visitas... en ese mismo navegador y dispositivo.
- Si abres la página desde el móvil y desde el portátil, verás dos "drives" distintos.
- Si borras los datos del navegador (o navegas en modo incógnito), se pierde el contenido.
- Nadie más que tú (en ese navegador) ve lo que subes — no hay backend que lo comparta.

Si más adelante quieres que sea de verdad multi-dispositivo o multi-usuario,
hace falta un backend (por ejemplo Firebase, Supabase o un bucket S3 con una API delante).

## Estructura de archivos

```
/
├── index.html   → estructura de la página
├── style.css    → estilos (estética "catálogo de fichero")
├── app.js       → lógica: IndexedDB, carpetas, drag & drop, renombrar, borrar
└── README.md    → este archivo
```

Este es justo el formato que mejor funciona con GitHub Pages: todo estático,
sin paso de compilación, y `index.html` en la raíz para que se sirva directamente.

## Publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub (o usa uno existente).
2. Sube estos 3 archivos (`index.html`, `style.css`, `app.js`) a la raíz del repositorio
   (o a una carpeta `/docs` si prefieres esa opción, ver paso 4).
3. Ve a **Settings → Pages** en tu repositorio.
4. En "Build and deployment", elige **Deploy from a branch**, selecciona la rama
   (normalmente `main`) y la carpeta (`/root` o `/docs`, según donde los subieras).
5. Guarda. GitHub te dará una URL del tipo:
   `https://tu-usuario.github.io/tu-repositorio/`
6. Espera 1-2 minutos y visita esa URL — ya tienes tu "drive" funcionando.

### Alternativa por línea de comandos

```bash
git init
git add index.html style.css app.js README.md
git commit -m "Archivo: drive estático para GitHub Pages"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

Luego activa Pages como en el paso 3-5 de arriba.

## Funcionalidades incluidas

- **Crear carpetas** con el botón "Nueva carpeta".
- **Arrastrar y soltar** archivos sueltos, varios a la vez, o carpetas enteras
  arrastradas desde el explorador de archivos del sistema (se recrea la jerarquía).
- **Subir por botón** ("Subir archivos") como alternativa al arrastre.
- **Navegar** haciendo doble clic (clic simple) en una carpeta; la ruta de migas
  de pan en verde permite volver atrás.
- **Arrastrar un archivo o carpeta sobre otra carpeta** (en la cuadrícula o en las
  migas de pan) para moverlo dentro de ella.
- **Renombrar** con el icono de lápiz (o tecla F2 con el elemento enfocado).
- **Eliminar** con el icono ✕ (pide confirmación; borra carpetas con su contenido).
- **Descargar** un archivo con un clic sobre su tarjeta.
- Contador de elementos y uso de almacenamiento aproximado en la cabecera.

## Personalización rápida

- Colores y tipografía: variables CSS al principio de `style.css` (`:root { ... }`).
- Textos: directamente en `index.html` y en los mensajes de `app.js` (`toast(...)`).
- Icono de la pestaña: el `<link rel="icon">` en `index.html` usa un emoji, puedes
  cambiarlo por el que prefieras.
