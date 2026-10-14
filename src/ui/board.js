/**
 * Plateau de création.
 *
 * - Glisser-déposer (souris ET tactile) d'un élément sur un autre => fusion.
 * - Contrôle alternatif accessible : sélectionner deux éléments (palette ou plateau)
 *   puis appuyer sur « Fusionner » (obligatoire, notamment pour le tactile).
 * - Déplacement, zoom, recentrage, nettoyage, annulation/rétablissement.
 *
 * Aucune donnée n'est injectée en HTML : tout passe par createElement/textContent.
 */
import { $, el, clear } from '../core/dom.js';

export class PlateauUI {
  constructor({ jeu, onFusion, onMessage }) {
    this.jeu = jeu;
    this.onFusion = onFusion;
    this.onMessage = onMessage || (() => {});
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.selection = [];
    this.filtrePalette = '';
    this.filtrePlateau = '';
    this.nodes = new Map(); // uid -> élément DOM
    this._drag = null;
    this._pan = null;
    this._bind();
  }

  _bind() {
    const board = $('#board');
    // Pan sur le fond
    board.addEventListener('pointerdown', (e) => {
      if (e.target !== board && e.target.id !== 'board-canvas') return;
      board.setPointerCapture(e.pointerId);
      this._pan = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      this.selection = [];
      this._majSelection();
    });
    board.addEventListener('pointermove', (e) => {
      if (!this._pan) return;
      this.panX = e.clientX - this._pan.x;
      this.panY = e.clientY - this._pan.y;
      this._appliquerTransform();
    });
    const finPan = () => { this._pan = null; };
    board.addEventListener('pointerup', finPan);
    board.addEventListener('pointercancel', finPan);

    // Zoom molette
    board.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.changerZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    // Boutons
    $('#btn-zoom-in').addEventListener('click', () => this.changerZoom(0.1));
    $('#btn-zoom-out').addEventListener('click', () => this.changerZoom(-0.1));
    $('#btn-center').addEventListener('click', () => this.recentrer());
    $('#btn-clean').addEventListener('click', () => { this.jeu.viderPlateau(); this.rendre(); this.onMessage('🧹 Plateau nettoyé.', 'info'); });
    $('#btn-undo').addEventListener('click', () => { if (this.jeu.annuler()) this.rendre(); });
    $('#btn-redo').addEventListener('click', () => { if (this.jeu.retablir()) this.rendre(); });
    $('#btn-fuse-selected').addEventListener('click', () => this.fusionnerSelection());
    $('#btn-clear-sel').addEventListener('click', () => { this.selection = []; this._majSelection(); });

    $('#palette-search').addEventListener('input', (e) => { this.filtrePalette = e.target.value.trim().toLowerCase(); this.rendrePalette(); });
    $('#board-search').addEventListener('input', (e) => {
      this.filtrePlateau = e.target.value.trim().toLowerCase();
      this.rendre();
    });
    $('#board-search').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !this.filtrePlateau) return;
      const trouve = this._elementsDecouverts().find((id) => this._nom(id).toLowerCase().includes(this.filtrePlateau));
      if (trouve) this.ajouterElement(trouve);
    });
  }

  _nom(id) { return this.jeu.store.elements.get(id)?.nom ?? id; }
  _emoji(id) { return this.jeu.store.elements.get(id)?.emoji ?? '✨'; }

  _elementsDecouverts() {
    return Object.keys(this.jeu.save?.decouvertes || {}).filter((id) => this.jeu.store.elements.has(id));
  }

  changerZoom(delta) {
    this.zoom = Math.min(2, Math.max(0.4, Math.round((this.zoom + delta) * 10) / 10));
    this._appliquerTransform();
  }

  recentrer() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._appliquerTransform();
  }

  _appliquerTransform() {
    $('#board-canvas').style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    $('#zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  /** Convertit des coordonnées écran en coordonnées du plateau. */
  _versPlateau(clientX, clientY) {
    const r = $('#board').getBoundingClientRect();
    return { x: (clientX - r.left - this.panX) / this.zoom, y: (clientY - r.top - this.panY) / this.zoom };
  }

  ajouterElement(id, position) {
    if (!this.jeu.save?.decouvertes?.[id]) {
      this.onMessage('🔒 Cet élément n\'a pas encore été découvert.', 'warn');
      return null;
    }
    const node = this.jeu.ajouterAuPlateau(id, position);
    this.rendre();
    return node;
  }

  /* -------------------- Rendu -------------------- */

  rendre() {
    this.rendrePlateau();
    this.rendrePalette();
    this._majSelection();
  }

  rendrePlateau() {
    const canvas = $('#board-canvas');
    clear(canvas);
    this.nodes.clear();
    const filtre = this.filtrePlateau;

    for (const node of this.jeu.plateau) {
      const meta = this.jeu.store.elements.get(node.elementId);
      if (filtre && !(meta?.nom || '').toLowerCase().includes(filtre)) continue;

      const dom = el('div', {
        class: 'node',
        dataset: { uid: node.uid, elementId: node.elementId },
        style: { left: `${node.x}px`, top: `${node.y}px` },
        role: 'button',
        tabindex: '0',
        'aria-label': `${meta?.nom || node.elementId}${this.selection.includes(node.elementId) ? ', sélectionné' : ''}`,
        title: `${meta?.nom || node.elementId} — ${meta?.categorie || ''}`,
      }, [
        el('span', { class: 'emoji', 'aria-hidden': 'true', text: meta?.emoji || '✨' }),
        el('span', { text: meta?.nom || node.elementId }),
      ]);

      if (this.selection.includes(node.elementId)) dom.classList.add('selected');

      dom.addEventListener('pointerdown', (e) => this._debutDrag(e, node, dom));
      dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.basculerSelection(node.elementId); }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.jeu.retirerDuPlateau(node.uid); this.rendre(); }
        const pas = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowLeft') { this.jeu.deplacerSurPlateau(node.uid, node.x - pas, node.y); this.rendre(); }
        if (e.key === 'ArrowRight') { this.jeu.deplacerSurPlateau(node.uid, node.x + pas, node.y); this.rendre(); }
        if (e.key === 'ArrowUp') { this.jeu.deplacerSurPlateau(node.uid, node.x, node.y - pas); this.rendre(); }
        if (e.key === 'ArrowDown') { this.jeu.deplacerSurPlateau(node.uid, node.x, node.y + pas); this.rendre(); }
      });
      dom.addEventListener('dblclick', () => { this.jeu.retirerDuPlateau(node.uid); this.rendre(); });

      canvas.append(dom);
      this.nodes.set(node.uid, dom);
    }
    this._appliquerTransform();
  }

  _debutDrag(e, node, dom) {
    e.stopPropagation();
    const depart = this._versPlateau(e.clientX, e.clientY);
    const offset = { x: depart.x - node.x, y: depart.y - node.y };
    let bouge = false;
    dom.setPointerCapture(e.pointerId);
    this._drag = { node, dom, offset, bouge, startX: e.clientX, startY: e.clientY };

    const move = (ev) => {
      if (!this._drag) return;
      const p = this._versPlateau(ev.clientX, ev.clientY);
      node.x = p.x - offset.x;
      node.y = p.y - offset.y;
      dom.style.left = `${node.x}px`;
      dom.style.top = `${node.y}px`;
      if (Math.abs(ev.clientX - this._drag.startX) > 4 || Math.abs(ev.clientY - this._drag.startY) > 4) {
        bouge = true;
        dom.classList.add('dragging');
      }
    };

    const up = (ev) => {
      dom.releasePointerCapture?.(e.pointerId);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.classList.remove('dragging');

      if (bouge) {
        this.jeu.deplacerSurPlateau(node.uid, node.x, node.y);
        // Dépôt sur un autre élément => fusion
        dom.style.pointerEvents = 'none';
        const cible = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node');
        dom.style.pointerEvents = '';
        if (cible && cible.dataset.uid !== node.uid) {
          const autreId = cible.dataset.elementId;
          this.onFusion(node.elementId, autreId);
          this.rendre();
        }
      } else {
        this.basculerSelection(node.elementId);
      }
      this._drag = null;
    };

    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
  }

  basculerSelection(id) {
    const i = this.selection.indexOf(id);
    if (i >= 0) this.selection.splice(i, 1);
    else {
      this.selection.push(id);
      if (this.selection.length > 2) this.selection.shift();
    }
    this._majSelection();
    this.rendrePlateau();
  }

  _majSelection() {
    const a = this.selection[0];
    const b = this.selection[1];
    const setChip = (node, id) => {
      if (!id) { node.textContent = '—'; node.className = 'chip chip-empty'; return; }
      node.textContent = `${this._emoji(id)} ${this._nom(id)}`;
      node.className = 'chip';
    };
    setChip($('#sel-a'), a);
    setChip($('#sel-b'), b);
    $('#btn-fuse-selected').disabled = this.selection.length !== 2;
  }

  fusionnerSelection() {
    if (this.selection.length !== 2) {
      this.onMessage('⚠️ Sélectionnez exactement deux éléments.', 'warn');
      return;
    }
    const [a, b] = this.selection;
    this.selection = [];
    this.onFusion(a, b);
    this.rendre();
  }

  rendrePalette() {
    const liste = $('#palette-list');
    clear(liste);
    const ids = this._elementsDecouverts().sort((x, y) => this._nom(x).localeCompare(this._nom(y), 'fr'));
    let n = 0;
    for (const id of ids) {
      const nom = this._nom(id);
      if (this.filtrePalette && !nom.toLowerCase().includes(this.filtrePalette)) continue;
      n++;
      const chip = el('button', {
        class: 'chip',
        'aria-pressed': String(this.selection.includes(id)),
        title: `➕ Ajouter ${nom} au plateau`,
        onClick: () => this.ajouterElement(id),
        onContextmenu: (e) => { e.preventDefault(); this.basculerSelection(id); },
      }, [
        el('span', { 'aria-hidden': 'true', text: this._emoji(id) }),
        el('span', { text: nom }),
      ]);
      if (this.selection.includes(id)) chip.style.borderColor = 'var(--accent)';
      liste.append(chip);
    }
    if (!n) liste.append(el('p', { class: 'muted', text: '🔍 Aucun élément.' }));
  }
}
