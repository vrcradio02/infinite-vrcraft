/**
 * Contrôleur principal du jeu.
 *
 * Il relie : le magasin de recettes, le moteur de fusion, la sauvegarde active,
 * la progression (XP/niveaux), les quêtes, les succès, les mondes, les collections,
 * les familiers et le quota d'aides. L'interface ne parle qu'à cette classe.
 */
import { RecipeStore } from '../fusion/store.js';
import { FusionEngine, STATUT } from '../fusion/engine.js';
import { GestionnaireSauvegardes } from '../saves/saves.js';
import { progression, titrePourNiveau, xpPourRarete, recompenseNiveau, xpPourFusionConnue } from './progression.js';
import { evaluerSucces } from '../quests/achievements.js';
import { tirerQuetes, cleJour, cleSemaine, avancerQuete } from '../quests/quests.js';
import { chargerFamiliers, nouveauFamilier, gagnerXpFamilier, niveauFamilier, indexerFamiliers } from '../pets/pets.js';
import { QuotaAides, executerAide } from '../pets/help.js';
import { chargerMondes, etatMondes, mondeDebloque } from './mondes.js';
import { chargerCollections, marquerCollections, collectionsNouvelles } from './collections.js';
import { EQUIPE_MAX, QUOTA, POTIONS, RARETES } from '../config.js';
import { emit, EV } from '../core/events.js';
import { obtenirAideIA, iaDisponible, chargerConfigIA, enregistrerConfigIA } from '../ai/ai.js';

/** Conditions de déblocage des familiers (progression du joueur). */
const DEBLOCAGE_FAMILIERS = [
  { id: 'flammichou', condition: () => true, message: 'Flammichou vous rejoint dès le début de l\'aventure.' },
  { id: 'aquabulle', condition: (s) => countDecouvertes(s) >= 15, message: 'Aquabulle émerge après 15 découvertes.' },
  { id: 'terrapousse', condition: (s) => countDecouvertes(s) >= 30, message: 'Terrapousse germe après 30 découvertes.' },
  { id: 'ventolino', condition: (s) => (s.niveau || 1) >= 5, message: 'Ventolino arrive au niveau 5.' },
  { id: 'pixelou', condition: (s) => countDecouvertes(s) >= 60, message: 'Pixelou se matérialise après 60 découvertes.' },
  { id: 'lumifee', condition: (s) => (s.niveau || 1) >= 8, message: 'Lumifée apparaît au niveau 8.' },
  { id: 'dragoforge', condition: (s) => countDecouvertes(s) >= 100, message: 'Dragoforge s\'éveille après 100 découvertes.' },
  { id: 'nebulapin', condition: (s) => (s.niveau || 1) >= 12, message: 'Nebulapin bondit jusqu\'à vous au niveau 12.' },
  { id: 'robochat', condition: (s) => countDecouvertes(s) >= 150, message: 'RoboChat s\'active après 150 découvertes.' },
  { id: 'glitchou', condition: (s) => (s.niveau || 1) >= 20, message: 'Glitchou apparaît au niveau 20. Attention au bogue.' },
];

function countDecouvertes(s) {
  return Object.keys(s.decouvertes || {}).length;
}

/**
 * Clé canonique d'une création : A + B et B + A désignent la même paire, donc la même
 * création (même élément reproductible).
 */
export function cleCreation(a, b) {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export class Jeu {
  constructor({ fetchImpl } = {}) {
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.store = new RecipeStore({ fetchImpl: this.fetch });
    this.engine = new FusionEngine(this.store);
    this.saves = new GestionnaireSauvegardes();
    this.pets = [];
    this.petIndex = new Map();
    this.quests = null;
    this.mondes = [];
    this.collections = [];
    this.slot = null;
    this.save = null;
    this.quota = null;
    this.plateau = [];
    this.undoStack = [];
    this.redoStack = [];
    this._autosaveTimer = null;
    this._pret = false;
  }

  get pret() {
    return this._pret;
  }

  /** Charge toutes les données statiques du jeu. */
  async initialiser(onProgress = () => {}) {
    onProgress('Chargement du registre de fusions…', 0.1);
    try {
      // Registre compilé (artefact de build) : voie rapide, tout est déjà indexé.
      await this.store.chargerRegistre();
    } catch (e) {
      // Repli : on reconstruit l'index depuis les sources versionnées.
      console.warn('[jeu] registre compilé indisponible, rechargement depuis les sources :', e.message);
      await this.store.chargerDepuisSources();
    }
    onProgress('Chargement des familiers…', 0.4);
    this.pets = await chargerFamiliers('./data/pets.json', this.fetch);
    this.petIndex = indexerFamiliers(this.pets);
    onProgress('Chargement des quêtes…', 0.6);
    const resQ = await this.fetch('./data/quests.json', { cache: 'no-cache' });
    if (!resQ.ok) throw new Error('Impossible de charger data/quests.json');
    this.quests = await resQ.json();
    onProgress('Chargement des mondes…', 0.8);
    this.mondes = await chargerMondes('./data/mondes.json', this.fetch);
    this.collections = await chargerCollections('./data/collections.json', this.fetch);
    onProgress('Prêt.', 1);
    this._pret = true;
    return this;
  }

  /** Résumé pour l'écran d'accueil. */
  async resume() {
    const slots = await this.saves.lister();
    return {
      slots,
      dernier: this.saves.dernierSlot(),
      elements: this.store.nombreElements,
      recettesOfficielles: this.store.nombreRecettes,
      iaDisponible: iaDisponible(),
      configIA: chargerConfigIA(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Sauvegarde active                                                   */
  /* ------------------------------------------------------------------ */

  async creer(slot, nom, avatar) {
    const data = await this.saves.creer(slot, nom, avatar);
    await this.activer(slot, data);
    return data;
  }

  async charger(slot) {
    const data = await this.saves.charger(slot);
    if (!data) return null;
    await this.activer(slot, data);
    return data;
  }

  async activer(slot, data) {
    this.slot = slot;
    this.save = data;
    this.plateau = [];
    this.undoStack = [];
    this.redoStack = [];

    // Quota d'aides : restauration (sauvegarde + miroir local, le plus restrictif gagne).
    this.quota = new QuotaAides(slot).restaurer(data.aideQuota);
    this.save.potions = Number.isFinite(this.save.potions) ? this.save.potions : POTIONS.depart;

    // Créations du joueur : rechargées dans le catalogue AVANT le reste, car elles
    // comptent comme des éléments officiels (découvertes, mondes, collections, succès).
    this.save.creations = this.save.creations || {};
    this._restaurerCreations();
    // Série de connexion (facultative, sans punition).
    this._majSerie();

    // Quêtes du jour / de la semaine.
    this._rafraichirQuetes(true);

    // Familiers débloqués.
    this._verifierDeblocages({ silencieux: true });

    // Collections, mondes, succès.
    marquerCollections(this.collections, this.save);
    this._majMondes({ silencieux: true });
    evaluerSucces(this.save).forEach((s) => { this.save.succes[s.id] = new Date().toISOString(); });

    this.save.aideQuota = this.quota.etat();
    await this.sauvegarder({ backup: false });
    emit(EV.SAUVEGARDE, { slot, save: this.save });
    return this.save;
  }

  /* ------------------------------------------------------------------ */
  /* Fusion                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Fusionne deux éléments.
   * @param {string} a
   * @param {string} b
   * @param {{mode?:string}} [options]
   */
  async fusionner(a, b, options = {}) {
    if (!this.save) return { ok: false, erreur: 'Aucune partie chargée.' };
    const mode = options.mode || this.save.parametres?.mode || 'catalogue';

    const resolution = this.engine.resoudre({
      a, b,
      mode,
      dejaDecouvert: (id) => Boolean(this.save.decouvertes[id]),
      creation: (x, y) => this.creationExistante(x, y),
    });

    this.save.stats.fusionsTentees++;

    // Aucun résultat du tout : on ne crée rien, on enregistre la tentative.
    if (resolution.statut === STATUT.INCONNU) {
      this._historiser(a, b, null, 'inconnu', mode);
      this._autosave();
      return { ok: false, statut: STATUT.INCONNU, raison: resolution.raison };
    }

    const resultat = resolution.resultat;

    if (resolution.statut === STATUT.EXPERIMENTAL) {
      // Mode Créativité sans recette officielle : on ne DEMANDE rien au joueur.
      // Le résultat est composé (service IA s'il est configuré, sinon composeur local
      // déterministe) puis enregistré comme élément officiel de la partie.
      const rep = await this._proposerCreation(a, b);
      return this.enregistrerCreation(a, b, rep.resultat, rep.avertissement ? 'local' : rep.source, rep.avertissement);
    }

    // Recette officielle : nouveau ou déjà connu.
    const nouveau = resolution.statut === STATUT.NOUVEAU;
    if (nouveau) {
      this.save.decouvertes[resultat.id] = {
        id: resultat.id,
        date: new Date().toISOString(),
        source: 'fusion',
        rarete: resultat.rarete,
        categorie: resultat.categorie,
        monde: resultat.monde,
      };
      this.save.stats.decouvertes = countDecouvertes(this.save);
      this.ajouterXp(xpPourRarete(resultat.rarete), { silencieux: true });
      emit(EV.DECOUVERTE, { resultat, recette: resolution.recette });
    } else {
      this.ajouterXp(xpPourFusionConnue(), { silencieux: true });
    }

    this._historiser(a, b, resultat.nom, nouveau ? 'nouveau' : 'connu', mode);
    this._evenementQuetes({ type: 'fusion', reussie: true });
    if (nouveau) {
      this._evenementQuetes({ type: 'decouverte', elementId: resultat.id, categorie: resultat.categorie, rarete: resultat.rarete, monde: resultat.monde });
      this._xpFamiliers(3);
    }
    this._majCollections();
    this._majMondes();
    this._verifierDeblocages();
    this._verifierSucces();
    this._autosave();

    emit(EV.FUSION, { statut: nouveau ? STATUT.NOUVEAU : STATUT.CONNU, resultat, recette: resolution.recette });
    return { ok: true, statut: nouveau ? STATUT.NOUVEAU : STATUT.CONNU, resultat, recette: resolution.recette };
  }

  /**
   * Compose une création pour une paire sans recette officielle.
   * Le composeur local est TOUJOURS disponible (aucun réseau requis) : si le service IA
   * facultatif est configuré il est essayé d'abord, sinon on retombe silencieusement dessus.
   * @returns {Promise<{source:string, resultat:object, avertissement?:string}>}
   */
  async _proposerCreation(a, b) {
    const nomA = this.store.elements.get(a)?.nom ?? a;
    const nomB = this.store.elements.get(b)?.nom ?? b;
    return obtenirAideIA({
      a, b, nomA, nomB, mode: 'creativite', fetchImpl: this.fetch,
      composerLocal: () => this.engine.composerExperimental(a, b),
    });
  }

  /** Création déjà enregistrée par le joueur pour cette paire, ou null. */
  creationExistante(a, b) {
    return this.save?.creations?.[cleCreation(a, b)] || null;
  }

  /**
   * Enregistre une création du mode Créativité comme ÉLÉMENT OFFICIEL de la partie :
   *  - l'élément entre dans le catalogue (donc utilisable comme ingrédient),
   *  - la paire devient reproductible (même paire => même élément),
   *  - il rejoint l'inventaire et l'encyclopédie comme première découverte,
   *  - il est persisté dans la sauvegarde (export/import compris) et rechargé à l'ouverture.
   * Aucune question n'est posée au joueur : la fusion reste fluide.
   */
  enregistrerCreation(a, b, resultat, source = 'local', avertissement = null) {
    const meta = this._metaCreation(a, b, resultat);
    if (!meta) return { ok: false, erreur: 'Création impossible : ingrédient inconnu.' };
    const cle = cleCreation(a, b);

    // 1. Catalogue de la partie : l'élément existe et sert d'ingrédient aux fusions suivantes.
    this.store.ajouterElements({ [meta.id]: meta });
    // 2. Recette du joueur : la paire devient reproductible (comme une recette officielle).
    this.ajouterRecetteCreation(a, b, meta, cle);

    // 3. Persistance : la création suit la sauvegarde.
    this.save.creations[cle] = { ...meta, a, b, source, date: new Date().toISOString() };
    // Compatibilité : l'ancien journal « expérimental » et le succès Expérimentateur suivent.
    this.save.experimental[cle] = { resultat: meta.nom, id: meta.id, date: new Date().toISOString(), source };
    this.save.stats.experimentales = (this.save.stats.experimentales || 0) + 1;

    const dejaConnue = Boolean(this.save.decouvertes[meta.id]);
    if (!dejaConnue) {
      // Première découverte : même traitement qu'une recette officielle (XP, quêtes, succès).
      this.save.decouvertes[meta.id] = {
        id: meta.id, date: new Date().toISOString(), source: 'creation',
        rarete: meta.rarete, categorie: meta.categorie, monde: meta.monde, premiere: true,
      };
      this.save.stats.decouvertes = countDecouvertes(this.save);
      this.ajouterXp(xpPourRarete(meta.rarete), { silencieux: true });
    } else {
      this.ajouterXp(xpPourFusionConnue(), { silencieux: true });
    }

    this._historiser(a, b, meta.nom, dejaConnue ? 'connu' : 'creation', 'creativite');
    this._evenementQuetes({ type: 'fusion', reussie: true });
    if (!dejaConnue) {
      this._evenementQuetes({ type: 'decouverte', elementId: meta.id, categorie: meta.categorie, rarete: meta.rarete, monde: meta.monde });
      this._xpFamiliers(3);
      this._majCollections();
      this._majMondes();
      this._verifierDeblocages();
      this._verifierSucces();
      emit(EV.DECOUVERTE, { resultat: this.store.elements.get(meta.id), creation: true });
    }
    this._autosave();

    const statut = dejaConnue ? STATUT.CONNU : STATUT.NOUVEAU;
    emit(EV.FUSION, { statut, resultat: meta, creation: true });
    return { ok: true, statut, resultat: meta, creation: true, source, avertissement, dejaConnue };
  }

  /** Ajoute la recette reproductible d'une création au magasin (idempotent). */
  ajouterRecetteCreation(a, b, meta, cle = cleCreation(a, b)) {
    this.store.ajouterRecettes([{
      id: `c-${cle.replace(/[^a-z0-9]+/gi, '-')}`, a, b, result: meta.id,
      categorie: meta.categorie, rarete: meta.rarete, monde: meta.monde,
      source: 'creation', statut: 'officiel', valide: true, version: 1, lot: 'creation',
    }]);
  }

  /**
   * Construit les métadonnées définitives d'une création : les données du composeur
   * (id, emoji, monde) servent de socle, celles de la proposition (IA ou locale) priment.
   * Une catégorie inventée par le service IA est ramenée sur une catégorie existante du
   * catalogue afin de garder des filtres cohérents.
   */
  _metaCreation(a, b, resultat) {
    const base = this.engine.composerExperimental(a, b);
    const src = resultat || {};
    const id = src.id || base?.id;
    const nom = src.nom || base?.nom;
    if (!id || !nom) return null;
    const ea = this.store.elements.get(a);
    const eb = this.store.elements.get(b);
    const categories = new Set([...this.store.elements.values()].map((e) => e.categorie));
    const categorie = categories.has(src.categorie)
      ? src.categorie
      : (base?.categorie || ea?.categorie || 'Fantastique');
    const rarete = RARETES.includes(src.rarete) ? src.rarete : (base?.rarete || 'Peu commun');
    const monde = src.monde || base?.monde || ea?.monde || eb?.monde || 'libre';
    return {
      id,
      nom,
      categorie,
      rarete,
      monde,
      emoji: src.emoji || base?.emoji || '✨',
      description: src.description || base?.description || `Création issue de « ${ea?.nom ?? a} » et « ${eb?.nom ?? b} ».`,
      creation: true,
    };
  }

  /**
   * Recharge dans le catalogue les créations enregistrées par le joueur, et officialise
   * les anciennes « créations expérimentales » (versions précédentes) en les recomposant.
   * Sans cela, un élément créé hier ne pourrait plus servir d'ingrédient aujourd'hui.
   * @returns {number} nombre de créations migrées
   */
  _restaurerCreations() {
    const creations = this.save.creations || (this.save.creations = {});
    let migrees = 0;

    for (const [ancienneCle, ancien] of Object.entries(this.save.experimental || {})) {
      const [a, b] = String(ancienneCle).split('|');
      if (!a || !b || !this.store.elements.has(a) || !this.store.elements.has(b)) continue;
      const cle = cleCreation(a, b);
      if (creations[cle]) continue;
      const compo = this.engine.composerExperimental(a, b);
      if (!compo) continue;
      creations[cle] = {
        ...compo, a, b,
        source: ancien?.source || 'local',
        date: ancien?.date || new Date().toISOString(),
        migre: true,
      };
      migrees++;
    }

    for (const c of Object.values(creations)) {
      if (!c?.id) continue;
      this.store.ajouterElements({ [c.id]: { ...c, experimental: false, creation: true } });
      if (c.a && c.b) this.ajouterRecetteCreation(c.a, c.b, c);
      if (!this.save.decouvertes[c.id]) {
        this.save.decouvertes[c.id] = {
          id: c.id, date: c.date, source: 'creation',
          rarete: c.rarete, categorie: c.categorie, monde: c.monde, premiere: true,
        };
      }
    }
    if (migrees) this.save.stats.decouvertes = countDecouvertes(this.save);
    return migrees;
  }

  /** Compatibilité : ancien point d'entrée « aide IA », désormais une fusion Créativité. */
  async fusionIA(a, b) {
    return this.fusionner(a, b, { mode: 'creativite' });
  }

  _historiser(a, b, resultat, statut, mode) {
    const nomA = this.store.elements.get(a)?.nom ?? a;
    const nomB = this.store.elements.get(b)?.nom ?? b;
    this.save.historique.unshift({
      a, b, nomA, nomB, resultat, statut, mode,
      date: new Date().toISOString(),
    });
    // Borne la taille de l'historique (performance + taille de sauvegarde).
    if (this.save.historique.length > 2000) this.save.historique.length = 2000;
  }

  /* ------------------------------------------------------------------ */
  /* Plateau, annuler / rétablir                                         */
  /* ------------------------------------------------------------------ */

  ajouterAuPlateau(elementId, position) {
    const node = {
      uid: `${elementId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      elementId,
      x: position?.x ?? 40 + (this.plateau.length % 6) * 110,
      y: position?.y ?? 40 + Math.floor(this.plateau.length / 6) * 56,
    };
    this.plateau.push(node);
    this._pousserUndo({ type: 'add', uid: node.uid });
    return node;
  }

  deplacerSurPlateau(uid, x, y) {
    const node = this.plateau.find((n) => n.uid === uid);
    if (!node) return;
    this._pousserUndo({ type: 'move', uid, x: node.x, y: node.y });
    node.x = x;
    node.y = y;
  }

  retirerDuPlateau(uid) {
    const i = this.plateau.findIndex((n) => n.uid === uid);
    if (i < 0) return;
    const node = this.plateau[i];
    this._pousserUndo({ type: 'remove', node: { ...node } });
    this.plateau.splice(i, 1);
  }

  viderPlateau() {
    this._pousserUndo({ type: 'clear', nodes: this.plateau.map((n) => ({ ...n })) });
    this.plateau = [];
  }

  _pousserUndo(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  annuler() {
    const action = this.undoStack.pop();
    if (!action) return false;
    this._appliquerInverse(action);
    this.redoStack.push(action);
    return true;
  }

  retablir() {
    const action = this.redoStack.pop();
    if (!action) return false;
    this._appliquer(action);
    this.undoStack.push(action);
    return true;
  }

  _appliquerInverse(a) {
    switch (a.type) {
      case 'add': this.plateau = this.plateau.filter((n) => n.uid !== a.uid); break;
      case 'remove': this.plateau.push(a.node); break;
      case 'clear': this.plateau = a.nodes.map((n) => ({ ...n })); break;
      case 'move': {
        const n = this.plateau.find((x) => x.uid === a.uid);
        if (n) { n.x = a.x; n.y = a.y; }
        break;
      }
      default: break;
    }
  }

  _appliquer(a) {
    switch (a.type) {
      case 'move': {
        const n = this.plateau.find((x) => x.uid === a.uid);
        if (n) { n.x = a.x; n.y = a.y; }
        break;
      }
      default: break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* XP / niveaux                                                        */
  /* ------------------------------------------------------------------ */

  ajouterXp(montant, { silencieux = false } = {}) {
    if (!this.save || !Number.isFinite(montant) || montant <= 0) return;
    const avant = progression(this.save.xp).niveau;
    this.save.xp += Math.floor(montant);
    const apres = progression(this.save.xp).niveau;
    if (apres > avant) {
      this.save.niveau = apres;
      const recompenses = recompenseNiveau(apres);
      // Chaque niveau du joueur rapporte aussi une potion de familier.
      this.save.potions = (this.save.potions || 0) + POTIONS.parNiveau;
      recompenses.push({ type: 'potion', montant: POTIONS.parNiveau, nom: `🧪 ${POTIONS.parNiveau} potion de familier (+1 niveau, quota rechargé)` });
      this._evenementQuetes({ type: 'niveau', niveau: apres });
      emit(EV.NIVEAU, { niveau: apres, titre: titrePourNiveau(apres), recompenses });
      this._verifierDeblocages();
    }
    if (!silencieux) emit(EV.XP, { montant, total: this.save.xp });
  }

  /* ------------------------------------------------------------------ */
  /* Quêtes                                                              */
  /* ------------------------------------------------------------------ */

  _rafraichirQuetes(forcer = false) {
    const q = this.save.quetes || (this.save.quetes = {});
    const jour = cleJour();
    const semaine = cleSemaine();

    if (forcer || q.derniereJour !== jour) {
      q.quotidiennes = tirerQuetes(this.quests.quotidiennes || [], 3, `jour:${jour}`);
      q.derniereJour = jour;
    }
    if (forcer || q.derniereSemaine !== semaine) {
      q.hebdomadaires = tirerQuetes(this.quests.hebdomadaires || [], 2, `semaine:${semaine}`);
      q.derniereSemaine = semaine;
    }
    if (!Array.isArray(q.scenarisees) || q.scenarisees.length === 0) {
      q.scenarisees = (this.quests.scenarios || []).map((s) => ({
        ...s, etape: 0, terminee: false, reclamee: false,
      }));
    }
  }

  /** Fait progresser les quêtes selon un événement de jeu. */
  _evenementQuetes(evt) {
    const q = this.save.quetes;
    if (!q) return;
    const traiter = (liste, scope) => {
      for (const quete of liste) {
        if (quete.reclamee) continue;
        const avant = quete.terminee;
        quete.progression = avancerQuete(quete, evt);
        quete.terminee = quete.progression >= (quete.objectif || 1);
        if (quete.terminee && !avant) emit(EV.QUETE_TERMINEE, { scope, quete });
      }
    };
    traiter(q.quotidiennes, 'quotidiennes');
    traiter(q.hebdomadaires, 'hebdomadaires');
    if (evt.type === 'decouverte') this._avancerScenarios(evt);
  }

  _avancerScenarios(evt) {
    for (const s of this.save.quetes.scenarisees || []) {
      if (s.terminee) continue;
      const etape = s.etapes?.[s.etape];
      if (!etape) { s.terminee = true; continue; }
      const c = etape.condition;
      if (c?.type === 'element' && c.cible === evt.elementId) {
        s.etape++;
        emit(EV.QUETE, { scenario: s, etape });
        if (s.etape >= (s.etapes?.length || 0)) {
          s.terminee = true;
          emit(EV.QUETE_TERMINEE, { scope: 'scenarios', quete: s });
        }
      }
    }
  }

  /** Réclame la récompense d'une quête terminée. */
  reclamerQuete(scope, id) {
    const liste = this.save.quetes?.[scope];
    if (!Array.isArray(liste)) return { ok: false, erreur: 'Quête introuvable.' };
    const quete = liste.find((x) => x.id === id);
    if (!quete) return { ok: false, erreur: 'Quête introuvable.' };
    if (!quete.terminee) return { ok: false, erreur: 'Quête non terminée.' };
    if (quete.reclamee) return { ok: false, erreur: 'Récompense déjà réclamée.' };
    quete.reclamee = true;
    this.save.stats.quetesTerminees = (this.save.stats.quetesTerminees || 0) + 1;
    const xp = quete.recompense?.xp || 50;
    const potions = quete.recompense?.potions ?? POTIONS.parQuete;
    this.save.potions = (this.save.potions || 0) + potions;
    this.ajouterXp(xp, { silencieux: true });
    this._majMondes();
    this._verifierSucces();
    this._autosave();
    return { ok: true, xp, potions };
  }

  _verifierSucces() {
    const nouveaux = evaluerSucces(this.save);
    for (const s of nouveaux) {
      this.save.succes[s.id] = new Date().toISOString();
      emit(EV.SUCCES, s);
    }
    return nouveaux;
  }

  /* ------------------------------------------------------------------ */
  /* Mondes et collections                                               */
  /* ------------------------------------------------------------------ */

  _majMondes({ silencieux = false } = {}) {
    this.save.mondes = this.save.mondes || {};
    for (const m of this.mondes) {
      const ok = mondeDebloque(m, this.save);
      if (ok && !this.save.mondes[m.id]) {
        this.save.mondes[m.id] = true;
        if (!silencieux) emit(EV.MONDE, m);
      } else if (ok) {
        this.save.mondes[m.id] = true;
      }
    }
  }

  _majCollections() {
    const nouvelles = collectionsNouvelles(this.collections, this.save);
    marquerCollections(this.collections, this.save);
    for (const c of nouvelles) {
      this.ajouterXp(c.recompense?.xp || 100, { silencieux: true });
      emit(EV.QUETE_TERMINEE, { scope: 'collections', quete: c });
      this._evenementQuetes({ type: 'collection', valeur: 1 });
    }
    return nouvelles;
  }

  etatMondes() {
    return etatMondes(this.mondes, this.save);
  }

  /* ------------------------------------------------------------------ */
  /* Familiers et aides                                                  */
  /* ------------------------------------------------------------------ */

  _verifierDeblocages({ silencieux = false } = {}) {
    const nouveaux = [];
    for (const def of DEBLOCAGE_FAMILIERS) {
      if (this.save.familiers[def.id]) continue;
      if (def.condition(this.save)) {
        this.save.familiers[def.id] = nouveauFamilier(def.id);
        nouveaux.push(def);
      }
    }
    if (nouveaux.length) {
      // Remplit automatiquement l'équipe tant qu'elle n'est pas pleine.
      for (const def of nouveaux) {
        if (this.save.equipe.length < EQUIPE_MAX && !this.save.equipe.includes(def.id)) {
          this.save.equipe.push(def.id);
          this.save.familiers[def.id].equipe = true;
        }
      }
      if (!silencieux) for (const def of nouveaux) emit(EV.FAMILIER, def);
    }
    return nouveaux;
  }

  equiperFamilier(id) {
    if (!this.save.familiers[id]) return { ok: false, erreur: 'Familier non possédé.' };
    if (this.save.equipe.includes(id)) return { ok: true, dejaEquipe: true };
    if (this.save.equipe.length >= EQUIPE_MAX) {
      return { ok: false, erreur: `Équipe complète (${EQUIPE_MAX} maximum). Retirez un familier d'abord.` };
    }
    this.save.equipe.push(id);
    this.save.familiers[id].equipe = true;
    this._autosave();
    return { ok: true };
  }

  retirerFamilier(id) {
    this.save.equipe = this.save.equipe.filter((x) => x !== id);
    if (this.save.familiers[id]) this.save.familiers[id].equipe = false;
    this._autosave();
    return { ok: true };
  }

  /**
   * Donne une potion à un familier :
   *  - il monte d'EXACTEMENT un niveau,
   *  - le quota d'aides est intégralement rechargé (3/5 -> 5/5, et 5/5 -> 10/5).
   * Les potions se gagnent en montant de niveau et en réclamant des quêtes.
   */
  donnerPotion(familierId) {
    if (!this.save) return { ok: false, erreur: 'Aucune partie chargée.' };
    const id = familierId || this.save.equipe[0];
    const etat = id ? this.save.familiers[id] : null;
    if (!etat) return { ok: false, erreur: 'Choisissez un familier possédé pour lui donner la potion.' };
    if ((this.save.potions || 0) <= 0) {
      return { ok: false, erreur: 'Aucune potion disponible : gagnez-en en montant de niveau ou en réclamant des quêtes.' };
    }

    this.save.potions -= 1;
    const info = niveauFamilier(etat.xp);
    const avant = etat.niveau;
    const { etat: maj } = gagnerXpFamilier(etat, Math.max(1, info.requis - info.dansNiveau));
    this.save.familiers[id] = { ...maj, niveau: avant + 1 };

    const recharge = this.quota.rechargerComplet();
    this.save.aideQuota = this.quota.etat();
    this._verifierSucces();
    this._autosave(true);
    emit(EV.FAMILIER, { type: 'niveau', id, niveau: this.save.familiers[id].niveau });

    return {
      ok: true,
      familier: id,
      nom: this.petIndex.get(id)?.nom || id,
      emoji: this.petIndex.get(id)?.emoji || '🐾',
      niveau: this.save.familiers[id].niveau,
      niveauPrecedent: avant,
      potions: this.save.potions,
      restant: recharge.restant,
      bonus: recharge.bonus,
      max: QUOTA.max,
      tempsRestant: this.quota.tempsRestant(),
    };
  }

  _xpFamiliers(montant) {
    for (const id of this.save.equipe) {
      const etat = this.save.familiers[id];
      if (!etat) continue;
      const { etat: maj, niveaux } = gagnerXpFamilier(etat, montant);
      this.save.familiers[id] = maj;
      if (niveaux > 0) emit(EV.FAMILIER, { type: 'niveau', id, niveau: maj.niveau });
    }
  }

  /**
   * Utilise une aide d'un familier.
   * L'aide n'est consommée QUE si un résultat utile est produit.
   * @param {string} type
   * @param {{familierId?:string, elementId?:string}} [options]
   */
  utiliserAide(type, options = {}) {
    if (!this.save) return { ok: false, erreur: 'Aucune partie chargée.' };

    const familierId = options.familierId || this.save.equipe[0];
    if (!familierId || !this.save.familiers[familierId]) {
      return { ok: false, erreur: 'Aucun familier actif. Équipez un familier.' };
    }
    const def = this.petIndex.get(familierId);
    const etat = this.save.familiers[familierId];
    const competences = (def?.competences || []).filter((c) => etat.niveau >= (c.niveauRequis || 1));
    const autorise = competences.some((c) => c.id === type);
    if (!autorise) {
      return { ok: false, erreur: `${def?.nom || 'Ce familier'} ne connaît pas encore « ${type} ». Faites-le monter de niveau.` };
    }

    if (this.quota.disponibles() <= 0) {
      const ms = this.quota.tempsRestant();
      return { ok: false, erreur: `Quota d'aides épuisé (5 par 10 minutes). Prochaine recharge dans ${formatDuree(ms)}.` };
    }

    const contexte = {
      store: this.store,
      decouverts: new Set(Object.keys(this.save.decouvertes)),
      jetons: `${this.slot}:${this.save.stats.aidesUtilisees}:${type}`,
      queteActive: this._queteActivePrioritaire(),
      mondesDebloques: this.save.mondes,
      elementId: options.elementId,
    };
    const rep = executerAide(type, contexte);

    if (!rep.utile) {
      // Aucun résultat utile : l'aide N'EST PAS consommée.
      return { ok: false, erreur: rep.texte, consomme: false };
    }

    if (!this.quota.consommer()) {
      return { ok: false, erreur: 'Quota épuisé.', consomme: false };
    }

    this.save.stats.aidesUtilisees = (this.save.stats.aidesUtilisees || 0) + 1;
    this.save.aideQuota = this.quota.etat();

    // XP du familier qui a aidé + progression de quête « familiers ».
    const maj = gagnerXpFamilier(etat, 10);
    this.save.familiers[familierId] = maj.etat;
    this._evenementQuetes({ type: 'famille_aide', familier: familierId });

    this._autosave(true);
    return {
      ok: true,
      texte: rep.texte,
      familier: def?.nom || familierId,
      emoji: def?.emoji || '🐾',
      restant: this.quota.disponibles(),
      tempsRestant: this.quota.tempsRestant(),
      consomme: true,
    };
  }

  _queteActivePrioritaire() {
    const listes = [this.save.quetes?.quotidiennes, this.save.quetes?.hebdomadaires];
    for (const l of listes) {
      const active = (l || []).find((q) => !q.terminee);
      if (active) return active;
    }
    return null;
  }

  /**
   * État affichable du quota d'aides.
   * `bonus` : une potion donnée alors que le quota était plein l'a poussé au-delà du
   * maximum (affiché « 10 / 5 ») ; la recharge de 10 minutes ramène ensuite à 5/5.
   */
  etatQuota() {
    if (!this.quota) return { restant: 0, tempsRestant: 0, max: QUOTA.max, bonus: false, potions: 0 };
    const restant = this.quota.disponibles();
    return {
      restant,
      tempsRestant: this.quota.tempsRestant(),
      max: QUOTA.max,
      bonusMax: QUOTA.bonusMax,
      bonus: restant > QUOTA.max,
      potions: this.save?.potions || 0,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres                                                          */
  /* ------------------------------------------------------------------ */

  majParametres(patch) {
    this.save.parametres = { ...(this.save.parametres || {}), ...patch };
    this.save.aideQuota = this.quota?.etat() ?? this.save.aideQuota;
    emit(EV.PREFS, this.save.parametres);
    this._autosave();
    return this.save.parametres;
  }

  configIA() { return chargerConfigIA(); }
  majConfigIA(config) { return enregistrerConfigIA(config); }

  /* ------------------------------------------------------------------ */
  /* Série de connexion (facultative, non punitive)                      */
  /* ------------------------------------------------------------------ */

  _majSerie() {
    const s = this.save.series || (this.save.series = { derniereConnexion: null, jours: 0 });
    const jour = cleJour();
    if (s.derniereConnexion === jour) return;
    const hier = cleJour(new Date(Date.now() - 86400000));
    s.jours = s.derniereConnexion === hier ? (s.jours || 0) + 1 : 1;
    s.derniereConnexion = jour;
    this.save.stats.joursDeJeu = (this.save.stats.joursDeJeu || 1) + 1;
  }

  /* ------------------------------------------------------------------ */
  /* Persistance                                                         */
  /* ------------------------------------------------------------------ */

  _autosave(immediat = false) {
    if (!this.save || this.slot === null) return;
    if (this.save.sauvegardeAuto === false && !immediat) return;
    clearTimeout(this._autosaveTimer);
    const delai = immediat ? 0 : 700;
    this._autosaveTimer = setTimeout(() => {
      this.sauvegarder({ backup: false }).catch((e) => console.error('[jeu] sauvegarde automatique échouée', e));
    }, delai);
  }

  async sauvegarder({ backup = false } = {}) {
    if (!this.save || this.slot === null) return null;
    if (this.quota) this.save.aideQuota = this.quota.etat();
    try {
      const propre = await this.saves.ecrire(this.slot, this.save, backup);
      this.save = propre;
      emit(EV.SAUVEGARDE, { slot: this.slot, save: this.save, auto: true });
      return propre;
    } catch (e) {
      emit('erreur', { message: `Sauvegarde impossible : ${e.message}` });
      return null;
    }
  }

  /** Statistiques dérivées pour l'affichage. */
  statistiques() {
    const s = this.save;
    if (!s) return null;
    const prog = progression(s.xp);
    return {
      niveau: prog.niveau,
      titre: titrePourNiveau(prog.niveau),
      xp: s.xp,
      xpDansNiveau: prog.xpDansNiveau,
      xpRequis: prog.xpRequis,
      ratio: prog.ratio,
      decouvertes: countDecouvertes(s),
      totalElements: this.store.nombreElements,
      // Les créations du joueur sont officielles pour SA partie : on les compte à part
      // du catalogue livré avec le jeu.
      recettesOfficielles: Math.max(0, this.store.nombreRecettes - Object.keys(s.creations || {}).length),
      creations: Object.keys(s.creations || {}).length,
      recettesExperimentales: Object.keys(s.experimental || {}).length,
      potions: s.potions || 0,
      fusionsTentees: s.stats.fusionsTentees,
      quetesTerminees: s.stats.quetesTerminees,
      mondesDebloques: Object.values(s.mondes || {}).filter(Boolean).length,
      familiers: Object.keys(s.familiers || {}).length,
      joursDeJeu: s.stats.joursDeJeu,
      aidesUtilisees: s.stats.aidesUtilisees || 0,
      succes: Object.keys(s.succes || {}).length,
    };
  }
}

/** Formate une durée en mm:ss. */
export function formatDuree(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export { xpPourFusionConnue };
