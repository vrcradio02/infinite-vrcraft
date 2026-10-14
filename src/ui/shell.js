/**
 * Coquille de l'interface : toasts, modale, confirmation et navigation entre écrans.
 * Aucune donnée dynamique n'est injectée en HTML (textContent uniquement).
 */
import { $, $$, el, clear } from '../core/dom.js';

/* ------------------------- Toasts ------------------------- */

const stack = () => $('#toast-stack');

export function toast(message, type = 'info', duree = 4200) {
  const node = el('div', { class: `toast ${type}`, role: 'status' }, [String(message)]);
  stack().append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, duree);
  return node;
}

/* ------------------------- Modale ------------------------- */

let onCloseModale = null;

export function ouvrirModale({ titre, contenu, actions = [], onClose }) {
  const m = $('#modal');
  $('#modal-title').textContent = titre || '';
  const body = $('#modal-body');
  clear(body);
  body.append(contenu instanceof Node ? contenu : el('div', { text: String(contenu ?? '') }));

  const zoneActions = $('#modal-actions');
  clear(zoneActions);
  for (const a of actions) {
    zoneActions.append(el('button', {
      class: `btn ${a.variant === 'primary' ? 'btn-primary' : ''} ${a.variant === 'danger' ? 'btn-danger' : ''}`.trim(),
      onClick: () => {
        const res = a.action ? a.action() : undefined;
        if (res !== false) fermerModale();
      },
    }, [a.label]));
  }
  if (!actions.length) {
    zoneActions.append(el('button', { class: 'btn', onClick: fermerModale }, ['✖️ Fermer']));
  }

  onCloseModale = onClose || null;
  m.hidden = false;
  $('#overlay').hidden = false;
  const premier = m.querySelector('button, input, select, textarea, a[href]');
  premier?.focus();
}

export function fermerModale() {
  $('#modal').hidden = true;
  $('#overlay').hidden = true;
  if (onCloseModale) { const f = onCloseModale; onCloseModale = null; f(); }
}

/** Confirmation avec rappel explicite de l'action. */
export function confirmer({ titre, message, labelOk = 'Confirmer', labelAnnuler = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    ouvrirModale({
      titre,
      contenu: el('p', { text: message }),
      actions: [
        { label: labelAnnuler, action: () => resolve(false) },
        { label: labelOk, variant: danger ? 'danger' : 'primary', action: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

/** Champ texte dans une modale. */
export function demanderTexte({ titre, message, valeur = '', maxlength = 40, labelOk = 'Valider' }) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', value: valeur, maxlength, type: 'text' });
    const conteneur = el('div', {}, [message ? el('p', { text: message }) : null, input]);
    ouvrirModale({
      titre,
      contenu: conteneur,
      actions: [
        { label: 'Annuler', action: () => resolve(null) },
        { label: labelOk, variant: 'primary', action: () => resolve(input.value.trim()) },
      ],
      onClose: () => resolve(null),
    });
    setTimeout(() => input.focus(), 30);
  });
}

/* ------------------------- Navigation ------------------------- */

const ecrans = new Set();

export function enregistrerEcrans(noms) {
  for (const n of noms) ecrans.add(n);
}

let ecranCourant = null;
const abonnes = new Set();

export function onEcran(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

export function allerA(nom) {
  if (!ecrans.has(nom)) nom = 'accueil';
  ecranCourant = nom;
  for (const s of $$('.screen')) s.hidden = s.dataset.screen !== nom;
  for (const b of $$('.nav-btn')) {
    b.setAttribute('aria-current', String(b.dataset.screen === nom));
  }
  $('#sidebar').classList.remove('open');
  $('#btn-menu')?.setAttribute('aria-expanded', 'false');
  for (const fn of abonnes) fn(nom);
  return nom;
}

export function ecranActuel() {
  return ecranCourant;
}

export function activerMenu() {
  const btn = $('#btn-menu');
  const sidebar = $('#sidebar');
  btn?.addEventListener('click', () => {
    const ouvert = sidebar.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(ouvert));
  });
  for (const b of $$('.nav-btn')) {
    b.addEventListener('click', () => allerA(b.dataset.screen));
  }
}

/** Raccourcis clavier globaux (accessibilité). */
export function activerRaccourcis(actions = {}) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fermerModale(); return; }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === '?' && actions.aide) actions.aide();
    if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && actions.annuler) { e.preventDefault(); actions.annuler(); }
    if ((e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) || (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) { e.preventDefault(); actions.retablir?.(); }
  });
}
