/* =========================================================
   Archivo — un "drive" que vive por completo en tu navegador.
   Almacena carpetas y archivos en IndexedDB. Sin backend,
   sin cuentas: perfecto para GitHub Pages, pero los datos
   solo existen en este navegador/dispositivo.
   ========================================================= */

const DB_NAME = 'archivo-db';
const DB_VERSION = 1;
const STORE = 'entries';

let db = null;
let currentFolderId = null; // null = raíz
const path = []; // pila de {id, name} desde la raíz hasta la carpeta actual

/* ---------------- IndexedDB helpers ---------------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const _db = req.result;
      if (!_db.objectStoreNames.contains(STORE)) {
        const store = _db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('parentId', 'parentId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function dbGetAllByParent(parentId) {
  return new Promise((resolve, reject) => {
    const store = tx('readonly');
    const idx = store.index('parentId');
    const req = idx.getAll(parentId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(id) {
  return new Promise((resolve, reject) => {
    const req = tx('readonly').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(entry) {
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbCountAll() {
  return new Promise((resolve, reject) => {
    const req = tx('readonly').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRecursive(id) {
  const children = await dbGetAllByParent(id);
  for (const child of children) {
    if (child.type === 'folder') await deleteRecursive(child.id);
    else await dbDelete(child.id);
  }
  await dbDelete(id);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/* ---------------- DOM refs ---------------- */

const gridEl = document.getElementById('grid');
const emptyStateEl = document.getElementById('emptyState');
const breadcrumbEl = document.getElementById('breadcrumb');
const statsEl = document.getElementById('stats');
const toastEl = document.getElementById('toast');
const dropOverlay = document.getElementById('dropOverlay');
const dropOverlayTarget = document.getElementById('dropOverlayTarget');
const fileInput = document.getElementById('fileInput');

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ---------------- Formatting ---------------- */

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function iconForFile(name, mime) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime?.startsWith('image/')) return '🖼️';
  if (mime?.startsWith('video/')) return '🎞️';
  if (mime?.startsWith('audio/')) return '🎵';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['js', 'ts', 'py', 'html', 'css', 'json', 'java', 'c', 'cpp', 'rb', 'go', 'rs'].includes(ext)) return '🧩';
  if (['txt', 'md'].includes(ext)) return '📝';
  return '📄';
}

/* ---------------- Rendering ---------------- */

async function refreshStats() {
  const total = await dbCountAll();
  let usageStr = '';
  if (navigator.storage?.estimate) {
    try {
      const { usage } = await navigator.storage.estimate();
      usageStr = ` · ${formatSize(usage)} usados`;
    } catch (_) {}
  }
  statsEl.textContent = `${total} elemento${total === 1 ? '' : 's'} en total${usageStr}`;
}

function renderBreadcrumb() {
  breadcrumbEl.innerHTML = '';
  const crumbs = [{ id: null, name: 'Inicio' }, ...path];
  crumbs.forEach((crumb, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = crumb.name;
    btn.type = 'button';
    btn.addEventListener('click', () => navigateTo(crumb.id, path.slice(0, i)));
    registerDropTarget(li, crumb.id, crumb.name);
    li.appendChild(btn);
    breadcrumbEl.appendChild(li);
  });
  dropOverlayTarget.textContent = crumbs[crumbs.length - 1].name;
}

async function render() {
  renderBreadcrumb();
  const entries = await dbGetAllByParent(currentFolderId);
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  gridEl.innerHTML = '';
  emptyStateEl.hidden = entries.length > 0;

  for (const entry of entries) {
    gridEl.appendChild(buildCard(entry));
  }
  refreshStats();
}

function buildCard(entry) {
  const card = document.createElement('div');
  card.className = `item item--${entry.type}`;
  card.tabIndex = 0;
  card.dataset.id = entry.id;
  card.draggable = true;

  const icon = document.createElement('div');
  icon.className = 'item__icon';
  icon.textContent = entry.type === 'folder' ? '📁' : iconForFile(entry.name, entry.mimeType);
  card.appendChild(icon);

  const name = document.createElement('p');
  name.className = 'item__name';
  name.textContent = entry.name;
  card.appendChild(name);

  const meta = document.createElement('p');
  meta.className = 'item__meta';
  meta.textContent = entry.type === 'folder'
    ? new Date(entry.dateAdded).toLocaleDateString('es-ES')
    : formatSize(entry.size);
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'item__actions';

  const renameBtn = document.createElement('button');
  renameBtn.className = 'item__action';
  renameBtn.title = 'Renombrar';
  renameBtn.textContent = '✎';
  renameBtn.addEventListener('click', (e) => { e.stopPropagation(); startRename(name, entry); });
  actions.appendChild(renameBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'item__action';
  delBtn.title = 'Eliminar';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); handleDelete(entry); });
  actions.appendChild(delBtn);

  card.appendChild(actions);

  // Open / download
  card.addEventListener('click', () => openEntry(entry));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openEntry(entry);
    if (e.key === 'F2') startRename(name, entry);
    if (e.key === 'Delete') handleDelete(entry);
  });

  // Drag reorder / move into folders
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-archivo-id', entry.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  if (entry.type === 'folder') {
    registerDropTarget(card, entry.id, entry.name);
  }

  return card;
}

function startRename(nameEl, entry) {
  nameEl.contentEditable = 'true';
  nameEl.focus();
  document.execCommand('selectAll', false, null);

  const commit = async () => {
    nameEl.contentEditable = 'false';
    const newName = nameEl.textContent.trim() || entry.name;
    nameEl.textContent = newName;
    if (newName !== entry.name) {
      entry.name = newName;
      await dbPut(entry);
      toast('Renombrado');
    }
    nameEl.removeEventListener('blur', commit);
    nameEl.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = entry.name; nameEl.blur(); }
  };
  nameEl.addEventListener('blur', commit);
  nameEl.addEventListener('keydown', onKey);
}

async function handleDelete(entry) {
  const label = entry.type === 'folder' ? 'la carpeta' : 'el archivo';
  if (!confirm(`¿Eliminar ${label} "${entry.name}"? ${entry.type === 'folder' ? 'Se borrará todo su contenido.' : ''}`)) return;
  if (entry.type === 'folder') await deleteRecursive(entry.id);
  else await dbDelete(entry.id);
  toast('Eliminado');
  render();
}

function openEntry(entry) {
  if (entry.type === 'folder') {
    navigateTo(entry.id, [...path, { id: entry.id, name: entry.name }]);
  } else {
    const url = URL.createObjectURL(entry.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function navigateTo(id, newPath) {
  currentFolderId = id;
  path.length = 0;
  path.push(...newPath);
  render();
}

/* ---------------- Create folder ---------------- */

async function createFolder() {
  const name = prompt('Nombre de la nueva carpeta:', 'Carpeta sin título');
  if (!name) return;
  const entry = {
    id: uid(),
    parentId: currentFolderId,
    name: name.trim(),
    type: 'folder',
    dateAdded: Date.now(),
  };
  await dbPut(entry);
  toast('Carpeta creada');
  render();
}

/* ---------------- Upload files ---------------- */

async function addFileEntry(file, parentId) {
  const entry = {
    id: uid(),
    parentId,
    name: file.name,
    type: 'file',
    size: file.size,
    mimeType: file.type,
    dateAdded: Date.now(),
    blob: file,
  };
  await dbPut(entry);
}

async function findOrCreateFolder(name, parentId) {
  const siblings = await dbGetAllByParent(parentId);
  const existing = siblings.find(s => s.type === 'folder' && s.name === name);
  if (existing) return existing.id;
  const id = uid();
  await dbPut({ id, parentId, name, type: 'folder', dateAdded: Date.now() });
  return id;
}

async function ingestFileList(fileList, parentId) {
  let count = 0;
  for (const file of fileList) {
    await addFileEntry(file, parentId);
    count++;
  }
  return count;
}

/* Traverse a dropped DataTransferItemList, preserving folder structure. */
async function ingestDataTransferItems(items, parentId) {
  let count = 0;

  async function walk(entry, parentId) {
    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file(async (file) => {
          await addFileEntry(file, parentId);
          count++;
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const folderId = await findOrCreateFolder(entry.name, parentId);
      const reader = entry.createReader();
      const entries = await new Promise((resolve) => {
        const all = [];
        const readBatch = () => {
          reader.readEntries((batch) => {
            if (batch.length === 0) return resolve(all);
            all.push(...batch);
            readBatch();
          });
        };
        readBatch();
      });
      for (const child of entries) {
        await walk(child, folderId);
      }
    }
  }

  const entries = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) return 0; // fallback handled by caller via files

  for (const entry of entries) {
    await walk(entry, parentId);
  }
  return count;
}

/* ---------------- Drag & drop (upload) ---------------- */

let dragDepth = 0;
let activeDropFolderId = null; // folder currently highlighted (breadcrumb or card)

function registerDropTarget(el, folderId, folderName) {
  el.addEventListener('dragover', (e) => {
    if (!isFileDrag(e) && !e.dataTransfer.types.includes('application/x-archivo-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-target', 'drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target', 'drag-over'));
  el.addEventListener('drop', async (e) => {
    el.classList.remove('drop-target', 'drag-over');
    if (isFileDrag(e)) {
      e.preventDefault();
      e.stopPropagation();
      await handleFileDrop(e, folderId, folderName);
    } else {
      const movedId = e.dataTransfer.getData('application/x-archivo-id');
      if (movedId && movedId !== folderId) {
        e.preventDefault();
        e.stopPropagation();
        const moved = await dbGet(movedId);
        if (moved && moved.id !== folderId) {
          moved.parentId = folderId;
          await dbPut(moved);
          toast(`Movido a "${folderName}"`);
          render();
        }
      }
    }
  });
}

function isFileDrag(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

async function handleFileDrop(e, parentId, folderName) {
  const items = e.dataTransfer.items;
  let count = 0;
  if (items && items.length && items[0].webkitGetAsEntry) {
    count = await ingestDataTransferItems(items, parentId);
  }
  if (count === 0 && e.dataTransfer.files?.length) {
    count = await ingestFileList(e.dataTransfer.files, parentId);
  }
  if (count > 0) toast(`${count} elemento${count === 1 ? '' : 's'} archivado${count === 1 ? '' : 's'} en "${folderName}"`);
  render();
}

/* Whole-window overlay for dropping into the current folder */
window.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return;
  dragDepth++;
  dropOverlay.classList.add('active');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove('active');
});
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('active');
  // Only handle here if the drop didn't land on a registered target (grid empty area, overlay)
  if (e.target === dropOverlay || e.target.closest('#dropOverlay') || e.target === document.body || e.target === gridEl || e.target === document.documentElement) {
    if (isFileDrag(e)) await handleFileDrop(e, currentFolderId, path.length ? path[path.length - 1].name : 'Inicio');
  }
});

/* ---------------- Toolbar wiring ---------------- */

document.getElementById('btnNewFolder').addEventListener('click', createFolder);
document.getElementById('btnUpload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  if (!fileInput.files.length) return;
  const count = await ingestFileList(fileInput.files, currentFolderId);
  toast(`${count} archivo${count === 1 ? '' : 's'} subido${count === 1 ? '' : 's'}`);
  fileInput.value = '';
  render();
});

/* Dropping on empty grid space (not on a folder card) files into the
   current folder — handled by the window-level 'drop' listener above,
   which checks e.target against the grid element. */

/* ---------------- Init ---------------- */

(async function init() {
  try {
    db = await openDB();
  } catch (err) {
    toast('No se pudo abrir el almacenamiento local de este navegador.');
    console.error(err);
    return;
  }
  render();
})();
