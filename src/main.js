/**
 * Point d'entrée du jeu.
 * Initialise le contrôleur, l'interface, les événements et le mode hors ligne.
 */
import { Jeu } from './game/game.js';
import { PlateauUI } from './ui/board.js';
import { Vues } from './ui/views.js';
import { $, el } from './core/dom.js';
import { on, EV } from './core/events.js';
import { toast, ouvrirModale, enregistrerEcrans, allerA, activerMenu, activerRaccourcis, onEcran } from './ui/shell.js';
import { setLangue, appliquerTraductions } from './i18n/index.js';
import { jouer } from './game/audio.js';
import { STATUT } from './fusion/engine.js';
import { GAME } from './config.js';

const VERSION = GAME.version;

const jeu = new Jeu();
let plateau = null;
let vues = null;

const ECRANS = ['accueil', 'jeu', 'inventaire', 'encyclopedie', 'quetes', 'mondes', 'familiers', 'historique', 'sauvegardes', 'parametres', 'profil', 'credits'];

/* -------------------- Écran de chargement -------------------- */

/** Au-delà de ce délai, le chargement est considéré comme bloqué (ms). */
const DELAI_MAX_CHARGEMENT = 20000;
let veilleChargement = null;
let chargementTermine = false;

/** Arrête la surveillance du chargement. */
function arreterVeille() {
  if (veilleChargement) { clearTimeout(veilleChargement); veilleChargement = null; }
}

/**
 * Affiche un problème de chargement et les actions de secours.
 *
 * Sans cela, un chargement qui échoue laissait l'écran de chargement affiché
 * indéfiniment, sans aucun moyen d'agir : le jeu était inaccessible.
 */
function signalerProblemeChargement(message) {
  if (chargementTermine) return;
  const sub = $('.boot-sub');
  if (sub) { sub.textContent = message; sub.classList.add('error'); }
  const actions = $('#boot-actions');
  if (actions) actions.hidden = false;
}

/** Boutons de secours : recharger, ou vider cache + service worker puis recharger. */
function activerActionsDeSecours() {
  $('#btn-boot-reload')?.addEventListener('click', () => location.reload());
  $('#btn-boot-reset')?.addEventListener('click', async () => {
    try {
      if (navigator?.serviceWorker?.getRegistrations) {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      }
      if (globalThis.caches?.keys) {
        for (const k of await caches.keys()) await caches.delete(k);
      }
    } catch (e) {
      console.warn('[boot] nettoyage partiel :', e.message);
    }
    location.reload();
  });
}

/**
 * Passe de l'écran de chargement à l'application.
 *
 * On ne se contente pas de l'attribut `hidden` : sa règle par défaut peut être écrasée
 * par une classe CSS qui déclare `display` (l'écran de chargement restait alors affiché
 * pour toujours et le jeu était inaccessible). Le style en ligne garantit la bascule.
 */
function afficherApplication() {
  chargementTermine = true;
  arreterVeille();
  const boot = $('#boot');
  if (boot) {
    boot.hidden = true;
    boot.style.display = 'none';
  }
  const app = $('#app');
  if (app) {
    app.hidden = false;
    app.style.display = '';
  }
}

async function demarrer() {
  enregistrerEcrans(ECRANS);

  // Les boutons de secours existent même si l'initialisation échoue plus bas.
  activerActionsDeSecours();
  const version = $('#boot-version');
  if (version) version.textContent = `version ${VERSION}`;
  const vApp = $('#app-version');
  if (vApp) vApp.textContent = VERSION;
  console.info(`[icu] version ${VERSION}`);

  // Surveille le chargement : si rien ne progresse, l'utilisateur reçoit un message
  // explicite et un bouton de rechargement (jamais d'attente infinie).
  veilleChargement = setTimeout(() => {
    signalerProblemeChargement(`⏳ Le chargement dépasse ${Math.round(DELAI_MAX_CHARGEMENT / 1000)} s. Vérifiez votre connexion, puis rechargez.`);
  }, DELAI_MAX_CHARGEMENT);

  try {
    await jeu.initialiser((etape, ratio) => {
      $('.boot-sub').textContent = etape;
      $('#boot-bar-fill').style.width = `${Math.round(ratio * 100)}%`;
    });
  } catch (e) {
    arreterVeille();
    signalerProblemeChargement(`⚠️ Erreur au chargement : ${e.message}`);
    console.error(e);
    return;
  }

  plateau = new PlateauUI({ jeu, onFusion: fusionner, onMessage: (m, t) => toast(m, t) });
  vues = new Vues({ jeu, plateau, onAction: allerA });

  // Icône/menu + navigation
  activerMenu();
  activerRaccourcis({
    annuler: () => { if (jeu.annuler()) plateau.rendre(); },
    retablir: () => { if (jeu.retablir()) plateau.rendre(); },
    aide: () => vues.tutoriel(),
  });

  // Boutons de l'accueil
  for (const b of document.querySelectorAll('[data-action]')) {
    b.addEventListener('click', () => traiterActionAccueil(b.dataset.action));
  }

  // Abonnements aux événements du jeu
  abonnerEvenements();

  appliquerTraductions();
  setLangue('fr');

  afficherApplication();
  allerA('accueil');

  // Chaque changement d'écran doit RENDRE son contenu (sinon l'écran restait vide).
  onEcran((nom) => {
    vues.rendre(nom);
    vues.majTopbar();
  });

  // Reprise automatique de la dernière partie si elle existe.
  const resume = await jeu.resume();
  const dernier = resume.dernier ?? resume.slots.find((s) => s.existe)?.slot;
  if (dernier !== null && dernier !== undefined && resume.slots[dernier]?.existe) {
    await jeu.charger(dernier);
    appliquerPreferences();
    toast(`▶️ Partie « ${jeu.save.nom} » reprise automatiquement.`, 'info');
    allerA('jeu');
  }

  installerServiceWorker();
}

/* -------------------- Actions de l'accueil -------------------- */

async function traiterActionAccueil(action) {
  switch (action) {
    case 'jouer': {
      if (!jeu.save) {
        const slot = await premierEmplacementLibre();
        if (slot === null) { toast('⚠️ Les trois emplacements sont occupés. Choisissez une sauvegarde.', 'warn'); allerA('sauvegardes'); return; }
        const rep = await demanderNom();
        if (rep === null) return;
        await jeu.creer(slot, rep.nom, rep.avatar);
        appliquerPreferences();
        toast('✨ Nouvelle partie : Feu, Eau, Terre et Vent vous attendent.', 'good');
      }
      return allerA('jeu');
    }
    case 'continuer': {
      const resume = await jeu.resume();
      const slot = resume.dernier ?? resume.slots.find((s) => s.existe)?.slot;
      if (slot === null || slot === undefined || !resume.slots[slot]?.existe) { toast('💤 Aucune partie à continuer.', 'warn'); return allerA('sauvegardes'); }
      await jeu.charger(slot);
      appliquerPreferences();
      toast(`▶️ Partie « ${jeu.save.nom} » chargée.`, 'good');
      return allerA('jeu');
    }
    case 'nouvelle': return allerA('sauvegardes');
    case 'sauvegardes': return allerA('sauvegardes');
    case 'quetes': return allerA('quetes');
    case 'encyclopedie': return allerA('encyclopedie');
    case 'familiers': return allerA('familiers');
    case 'parametres': return allerA('parametres');
    case 'tutoriel': return vues.tutoriel();
    default: return undefined;
  }
}

async function premierEmplacementLibre() {
  const resume = await jeu.resume();
  const libre = resume.slots.find((s) => !s.existe);
  return libre ? libre.slot : null;
}

function demanderNom() {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', value: 'Joueur', maxlength: 40, type: 'text' });
    const sel = el('select', { class: 'input' }, ['🧪', '🔥', '💧', '🌍', '💨', '🐉', '🌸', '⭐'].map((e) => el('option', { value: e, text: e })));
    ouvrirModale({
      titre: '✨ Nouvelle partie',
      contenu: el('div', {}, [
        el('p', { text: 'Choisissez un pseudonyme et un avatar. Aucun e-mail ni numéro de téléphone n\'est demandé.' }),
        el('div', { class: 'row' }, [input, sel]),
      ]),
      actions: [
        { label: 'Annuler', action: () => resolve(null) },
        { label: 'Créer', variant: 'primary', action: () => resolve({ nom: input.value.trim() || 'Joueur', avatar: sel.value }) },
      ],
      onClose: () => resolve(null),
    });
    setTimeout(() => input.focus(), 30);
  });
}

/* -------------------- Fusion -------------------- */

async function fusionner(a, b) {
  if (!jeu.save) { toast('📂 Créez ou chargez une partie d\'abord.', 'warn'); allerA('sauvegardes'); return; }
  const r = await jeu.fusionner(a, b);
  if (!r.ok) {
    if (r.statut === STATUT.INCONNU) {
      // Fusion fluide : AUCUNE question posée, aucune fenêtre bloquante. On indique
      // simplement la piste du mode Créativité.
      toast('🔎 Aucune recette connue pour cette paire. Activez le mode Créativité (⚙️ Paramètres) pour inventer un nouvel élément.', 'warn', 6000);
      jouer('erreur', jeu.save.parametres);
    }
    return;
  }
  if (r.avertissement) toast(`🤖 ${r.avertissement}`, 'info', 7000);
  plateau.ajouterElement(r.resultat.id);
  plateau.rendre();
}

/** Fenêtre de découverte d'une recette OFFICIELLE du catalogue. */
function afficherResultat(resultat) {
  const rarete = resultat.rarete || 'Commun';
  const contenu = el('div', { class: 'discovery' }, [
    el('div', { class: 'emoji', 'aria-hidden': 'true', text: resultat.emoji || '✨' }),
    el('div', { class: 'name', text: resultat.nom }),
    el('span', { class: `badge rare-${String(rarete).replace(/\s+/g, '-')}`, text: `${rarete} · ${resultat.categorie || ''}` }),
    el('p', { class: 'muted', text: resultat.description || '' }),
    el('p', { class: 'good', text: 'Nouvelle découverte enregistrée !' }),
  ]);
  ouvrirModale({
    titre: '🎉 Nouvelle découverte !',
    contenu,
    actions: [
      { label: 'Fermer' },
      { label: 'Partager', action: () => { partagerResultat(resultat); return false; } },
    ],
  });
}

/**
 * Annonce d'une CRÉATION (mode Créativité) : elle est enregistrée comme élément
 * officiel de la partie et rejoint l'inventaire, sans interrompre la partie.
 */
function annoncerCreation(resultat) {
  toast(`🧬 1ʳᵉ découverte : ${resultat.emoji || '✨'} ${resultat.nom} — enregistré comme élément officiel et ajouté à l'inventaire.`, 'good', 8000);
}

async function partagerResultat(resultat) {
  const texte = `${resultat.emoji || '✨'} ${resultat.nom} (${resultat.rarete}) — découvert dans Infinite Craft Ultimate`;
  try {
    await navigator.clipboard.writeText(texte);
    toast('📋 Découverte copiée dans le presse-papiers.', 'good');
  } catch {
    ouvrirModale({ titre: '📤 Partager la découverte', contenu: el('pre', { class: 'code-preview', text: texte }) });
  }
}

/* -------------------- Événements -------------------- */

function abonnerEvenements() {
  on(EV.DECOUVERTE, ({ resultat, creation }) => {
    const rare = ['Légendaire', 'Mythique', 'Cosmique', 'Secret'].includes(resultat.rarete);
    jouer(rare ? 'rare' : 'decouverte', jeu.save?.parametres);
    // Une création est annoncée par un message discret : pas de fenêtre à fermer,
    // la partie reste fluide (elle est déjà dans l'inventaire).
    if (creation) annoncerCreation(resultat);
    else afficherResultat(resultat);
    vues.majTopbar();
  });

  on(EV.FUSION, ({ statut }) => {
    if (statut === STATUT.CONNU) jouer('fusion', jeu.save?.parametres);
  });

  on(EV.NIVEAU, ({ niveau, titre, recompenses }) => {
    jouer('niveau', jeu.save?.parametres);
    ouvrirModale({
      titre: `🎉 Niveau ${niveau} atteint !`,
      contenu: el('div', {}, [
        el('p', { text: `Nouveau titre : ${titre}` }),
        el('ul', {}, (recompenses || []).map((r) => el('li', { text: r.nom || `${r.montant} ${r.type}` }))),
      ]),
    });
    vues.majTopbar();
  });

  on(EV.QUETE_TERMINEE, ({ quete }) => {
    jouer('quete', jeu.save?.parametres);
    toast(`Quête terminée : « ${quete.nom} ». Réclamez la récompense dans l'onglet Quêtes.`, 'good', 7000);
  });

  on(EV.SUCCES, (s) => {
    jouer('quete', jeu.save?.parametres);
    toast(`🏅 Succès : ${s.nom}`, 'good');
  });

  on(EV.FAMILIER, (def) => {
    if (def?.type === 'niveau') { toast(`${def.id} monte au niveau ${def.niveau} !`, 'good'); return; }
    toast(`🐾 Nouveau familier : ${def.nom} — ${def.message}`, 'good', 7000);
  });

  on(EV.MONDE, (m) => toast(`🗺️ Nouveau monde débloqué : ${m.nom}`, 'good'));

  on(EV.PREFS, () => appliquerPreferences());

  on('erreur', ({ message }) => toast(message, 'bad'));
}

function appliquerPreferences() {
  const p = jeu.save?.parametres || {};
  document.documentElement.dataset.theme = p.theme || 'cosmos';
  document.documentElement.dataset.reduceMotion = p.animationsReduites ? '1' : '0';
  document.documentElement.style.fontSize = `${15 * (p.tailleElements ?? 1)}px`;
  setLangue(p.langue || 'fr');
  vues?.majTopbar();
}

/* -------------------- Hors ligne -------------------- */

function installerServiceWorker() {
  if (!navigator?.serviceWorker?.register) return; // API absente (http non sécurisé, mode privé...)
  if (location.protocol === 'file:') return; // le service worker exige http(s)

  // Si un service worker contrôlait déjà la page, une nouvelle version qui prend la
  // main (correctif publié) doit se voir tout de suite : on recharge une seule fois.
  const avaitControleur = Boolean(navigator.serviceWorker.controller);
  let rechargeEffectuee = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitControleur || rechargeEffectuee) return;
    rechargeEffectuee = true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((enregistrement) => {
    // On cherche une mise à jour à chaque retour sur l'onglet.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) enregistrement.update?.().catch(() => {});
    });
  }).catch((e) => {
    console.warn('[sw] enregistrement impossible :', e.message);
  });
}

demarrer();

// Exposé pour le débogage en console (sans donner accès à des secrets, il n'y en a aucun).
window.__icu = { jeu, allerA, afficherApplication, version: VERSION, plateau: () => plateau, vues: () => vues };
