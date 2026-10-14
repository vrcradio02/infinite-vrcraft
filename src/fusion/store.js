/**
 * Magasin de recettes.
 *
 * - Charge le registre officiel compilé (`data/registre-fusions.json`).
 * - Construit un index pairKey -> recette pour une recherche O(1).
 * - Supporte le chargement progressif et un repli sur les sources versionnées.
 */
import { pairKey } from './normalize.js';
import { expandRegistre } from './registry-format.js';

export class RecipeStore {
  constructor({ fetchImpl } = {}) {
    /** @type {Map<string, object>} index pairKey -> recette */
    this.index = new Map();
    /** @type {Map<string, object>} index id de recette -> recette */
    this.parId = new Map();
    /** @type {Map<string, object>} id d'élément -> métadonnées */
    this.elements = new Map();
    /** @type {Set<string>} lots déjà chargés */
    this.lotsCharges = new Set();
    this.manifest = null;
    this.charge = false;
    this._fetch = fetchImpl || ((...args) => fetch(...args));
  }

  /**
   * Charge le registre officiel compilé (format compact ou développé).
   * @param {string} url
   * @param {string} [statut] 'officiel' | 'candidat' | 'tous' : quelles recettes indexer.
   *   Par défaut, seules les recettes OFFICIELLES sont chargées dans le moteur :
   *   les candidats restent mesurables séparément et ne comptent pas comme découvertes.
   */
  async chargerRegistre(url = './data/registre-fusions.json', statut = 'officiel') {
    const brut = await this._json(url);
    const data = expandRegistre(brut);
    this.ajouterElements(data.elements || {});
    const recettes = statut === 'tous'
      ? data.recipes
      : data.recipes.filter((r) => r.source === statut);
    this.ajouterRecettes(recettes);
    this.manifest = data.manifest || null;
    this.charge = true;
    return this;
  }

  /**
   * Charge le catalogue directement depuis les sources versionnées :
   *   - data/elements.json (catalogue d'éléments),
   *   - data/fusions/index.json (liste des lots),
   *   - data/fusions/lot-*.json (recettes).
   *
   * Utilisé quand le registre compilé n'est pas disponible : le registre est un
   * ARTEFACT DE BUILD produit par `npm run build`, mais le jeu reste jouable sur un
   * hébergement statique sans avoir à exécuter l'outil de compilation.
   */
  async chargerDepuisSources() {
    const el = await this._json('./data/elements.json');
    for (const [id, t] of Object.entries(el.elements || {})) {
      if (!Array.isArray(t) || t.length < 5 || this.elements.has(id)) continue;
      const [nom, categorie, rarete, monde, emoji, description = ''] = t;
      this.elements.set(id, { id, nom, categorie, rarete, monde, emoji, description });
    }

    let lots = null;
    try {
      lots = (await this._json('./data/fusions/index.json')).lots;
    } catch {
      lots = null;
    }
    if (!Array.isArray(lots)) {
      throw new Error('Impossible de charger data/fusions/index.json : la liste des lots est requise.');
    }

    let total = 0;
    for (const nom of lots) total += await this.chargerLot(nom);
    this.manifest = { elements: this.elements.size, recettes: this.index.size, recettesOfficielles: this.index.size, recettesCandidates: 0, lots };
    this.charge = true;
    return total;
  }

  /**
   * Charge un lot additionnel à la demande (chargement progressif).
   * Format du lot : { lot, monde, statut?, recipes: [[a, b, resultat], ...] }
   */
  async chargerLot(nom) {
    if (this.lotsCharges.has(nom)) return 0;
    const data = await this._json(`./data/fusions/lot-${nom}.json`);
    if (data.elements) this.ajouterElements(data.elements);
    const statut = data.statut || 'officiel';
    const recettes = (data.recipes || []).map((entree) => this._depuisLot(entree, nom, statut)).filter(Boolean);
    const n = this.ajouterRecettes(recettes);
    this.lotsCharges.add(nom);
    return n;
  }

  /**
   * Convertit une entrée compacte de lot en recette complète.
   * La catégorie et la rareté sont DÉRIVÉES de l'élément résultat (cohérence garantie).
   * Les entrées invalides sont ignorées : `npm run validate` les signale toutes.
   */
  _depuisLot(entree, lot, statut) {
    if (!Array.isArray(entree) || entree.length < 3) return null;
    const [a, b, result] = entree;
    const meta = this.elements.get(result);
    if (!meta || !this.elements.has(a) || !this.elements.has(b)) return null;
    const ordonne = entree[3] === 'ordered';
    return {
      id: `r-${a <= b ? `${a}-${b}` : `${b}-${a}`}`,
      a, b, result,
      ordered: ordonne,
      categorie: meta.categorie,
      rarete: meta.rarete,
      monde: meta.monde,
      source: statut === 'officiel' ? 'officiel' : 'candidat',
      statut,
      valide: true,
      version: 1,
      lot,
    };
  }

  /** Ajoute un objet {id: meta} d'éléments. */
  ajouterElements(obj) {
    for (const [id, meta] of Object.entries(obj)) {
      if (!this.elements.has(id)) this.elements.set(id, { id, ...meta });
    }
  }

  /**
   * Ajoute des recettes au magasin.
   * Les doublons de paire sont ignorés (le premier gagne).
   * @returns {number} nombre de recettes réellement ajoutées
   */
  ajouterRecettes(recipes) {
    let ajoutees = 0;
    for (const r of recipes) {
      const key = pairKey(r.a, r.b, r.ordered === true);
      if (this.index.has(key)) continue;
      const recette = { ...r, key };
      this.index.set(key, recette);
      if (r.id) this.parId.set(r.id, recette);
      ajoutees++;
    }
    return ajoutees;
  }

  /** Recherche une recette pour deux ingrédients. */
  trouver(a, b) {
    return this.index.get(pairKey(a, b, false)) || this.index.get(pairKey(a, b, true)) || null;
  }

  /** Toutes les recettes connues produisant un élément donné. */
  recettesVers(elementId) {
    const out = [];
    for (const r of this.index.values()) {
      if (r.result === elementId) out.push(r);
    }
    return out;
  }

  /** Compteur réel de recettes officielles indexées (pas de gonflement artificiel). */
  get nombreRecettes() {
    return this.index.size;
  }

  get nombreElements() {
    return this.elements.size;
  }

  async _json(url) {
    const res = await this._fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
    return res.json();
  }
}

export { pairKey };
