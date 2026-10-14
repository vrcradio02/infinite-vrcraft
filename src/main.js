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

const jeu = new Jeu();
let plateau = null;
let vues = null;

const ECRANS = ['accueil', 'jeu', 'inventaire', 'encyclopedie', 'quetes', 'mondes', 'familiers', 'historique', 'sauvegardes', 'parametres', 'profil', 'credits'];

/* -------------------- Écran de chargement -------------------- */

/**
 * Passe de l'écran de chargement à l'application.
 *
 * On ne se contente pas de l'attribut `hidden` : sa règle par défaut peut être écrasée
 * par une classe CSS qui déclare `display` (l'écran de chargement restait alors affiché
 * pour toujours et le jeu était inaccessible). Le style en ligne garantit la bascule.
 */
function afficherApplication() {
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
  try {
    await jeu.initialiser((etape, ratio) => {
      $('.boot-sub').textContent = etape;
      $('#boot-bar-fill').style.width = `${Math.round(ratio * 100)}%`;
    });
  } catch (e) {
    const sub = $('.boot-sub');
    sub.textContent = `⚠️ Erreur au chargement : ${e.message}`;
    sub.classList.add('error');
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
      const paire = [a, b];
      const contenu = el('div', {}, [
        el('p', { text: r.raison || 'Aucune recette officielle pour cette paire.' }),
        el('p', { class: 'muted', text: 'Vous pouvez tester le mode Créativité (proposition expérimentale locale ou service IA facultatif).' }),
      ]);
      ouvrirModale({
        titre: '🚫 Pas de recette connue',
        contenu,
        actions: [
          { label: 'Fermer' },
          { label: 'Essayer en Créativité', variant: 'primary', action: async () => {
            const res = await jeu.fusionIA(paire[0], paire[1]);
            if (res.ok) { plateau.ajouterElement(res.resultat.id); afficherResultat(res.resultat, 'experimental'); }
            else toast(res.erreur, 'bad');
          } },
        ],
      });
      jouer('erreur', jeu.save.parametres);
    }
    return;
  }
  plateau.ajouterElement(r.resultat.id);
  plateau.rendre();
  if (r.statut === STATUT.EXPERIMENTAL) afficherResultat(r.resultat, 'experimental');
}

function afficherResultat(resultat, statut) {
  const rarete = resultat.rarete || 'Commun';
  const contenu = el('div', { class: 'discovery' }, [
    el('div', { class: 'emoji', 'aria-hidden': 'true', text: resultat.emoji || '✨' }),
    el('div', { class: 'name', text: resultat.nom }),
    el('span', { class: `badge rare-${String(rarete).replace(/\s+/g, '-')}`, text: `${rarete} · ${resultat.categorie || ''}` }),
    el('p', { class: 'muted', text: resultat.description || '' }),
    statut === 'experimental'
      ? el('p', { class: 'warn', text: 'Création EXPÉRIMENTALE : elle ne compte pas comme recette officielle.' })
      : el('p', { class: 'good', text: 'Nouvelle découverte enregistrée !' }),
  ]);
  ouvrirModale({
    titre: statut === 'experimental' ? '🧬 Création expérimentale' : '🎉 Nouvelle découverte !',
    contenu,
    actions: [
      { label: 'Fermer' },
      { label: 'Partager', action: () => { partagerResultat(resultat); return false; } },
    ],
  });
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
  on(EV.DECOUVERTE, ({ resultat }) => {
    const rare = ['Légendaire', 'Mythique', 'Cosmique', 'Secret'].includes(resultat.rarete);
    jouer(rare ? 'rare' : 'decouverte', jeu.save?.parametres);
    afficherResultat(resultat, 'nouveau');
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
  navigator.serviceWorker.register('./sw.js').catch((e) => {
    console.warn('[sw] enregistrement impossible :', e.message);
  });
}

demarrer();

// Exposé pour le débogage en console (sans donner accès à des secrets, il n'y en a aucun).
window.__icu = { jeu, allerA, afficherApplication, plateau: () => plateau, vues: () => vues };
