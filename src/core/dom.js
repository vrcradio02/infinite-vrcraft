/**
 * Petits utilitaires DOM.
 * Règle de sécurité : tout contenu dynamique passe par textContent / createElement.
 * On n'utilise JAMAIS innerHTML avec des données issues d'un fichier importé ou d'une API.
 */

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

/**
 * Crée un élément.
 * @param {string} tag
 * @param {object} [props] attributs (class, dataset, aria-*, text, style, onXxx)
 * @param {(Node|string)[]} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function show(node, visible = true) {
  node.hidden = !visible;
}

/** Échappe une chaîne pour un affichage texte sûr (utilisé dans les exports texte). */
export function escapeText(value) {
  return String(value ?? '');
}
