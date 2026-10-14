/**
 * Système de traduction minimal.
 * Le français est la langue par défaut ; ajouter une langue = ajouter un dictionnaire.
 * Les textes du DOM portent l'attribut data-i18n / data-i18n-ph.
 */
const DICT = {
  fr: {
    'boot.loading': 'Chargement du catalogue…',
    'nav.accueil': 'Accueil',
    'nav.jeu': 'Atelier',
    'nav.inventaire': 'Inventaire',
    'nav.encyclopedie': 'Encyclopédie',
    'nav.quetes': 'Quêtes',
    'nav.mondes': 'Mondes',
    'nav.familiers': 'Familiers',
    'nav.amis': 'Amis',
    'nav.historique': 'Historique',
    'nav.sauvegardes': 'Sauvegardes',
    'nav.parametres': 'Paramètres',
    'nav.profil': 'Profil',
    'nav.credits': 'Crédits',
    'home.tagline': 'Combinez Feu, Eau, Terre et Vent pour découvrir un univers infini.',
    'home.play': 'Jouer',
    'home.play.sub': "Ouvrir l'atelier de fusion",
    'home.continue': 'Continuer',
    'home.new': 'Nouvelle partie',
    'home.new.sub': 'Créer une sauvegarde',
    'home.saves': 'Sauvegardes',
    'home.saves.sub': '3 emplacements indépendants',
    'home.quests': 'Quêtes',
    'home.quests.sub': 'Objectifs et défis',
    'home.collection': 'Collection',
    'home.collection.sub': 'Vos découvertes',
    'home.pets': 'Animaux',
    'home.pets.sub': 'Familiers et aides',
    'home.friends': 'Amis',
    'home.friends.sub': 'Ajouter un joueur (+10 potions)',
    'friends.title': 'Amis',
    'friends.sub': "Entrez le pseudonyme d'un joueur : il reçoit une notification « voulez-vous l'ajouter dans vos amis ? ». Chaque ami accepté rapporte 10 potions.",
    'friends.inbox': 'Demandes à valider',
    'friends.sent': 'Demandes envoyées',
    'friends.list': "Ma liste d'amis",
    'friends.profile': 'Profils partagés',
    'friends.profile.inventory': 'Objets et découvertes',
    'friends.profile.pets': 'Animaux',
    'friends.profile.compare': 'Vous et votre ami',
    'friends.refreshAll': 'Tout rafraîchir',
    'friends.code': "Code d'invitation (sans serveur)",
    'settings.friends': "Relais d'amis facultatif",
    'home.settings': 'Paramètres',
    'home.settings.sub': 'Thème, sons, accessibilité',
    'home.tuto': 'Tutoriel',
    'home.tuto.sub': 'Apprendre à fusionner',
    'home.status': 'État du jeu',
    'board.center': 'Recentrer',
    'board.clean': 'Nettoyer le plateau',
    'board.undo': 'Annuler',
    'board.redo': 'Rétablir',
    'board.search': 'Rechercher un élément…',
    'board.fuse': 'Fusionner',
    'board.palette': 'Éléments disponibles',
    'board.selection': 'Sélection :',
    'board.clearSel': 'Vider',
    'quests.title': 'Quêtes',
    'quests.ach': 'Succès',
    'worlds.title': 'Mondes',
    'worlds.sub': 'Débloquez de nouveaux univers en progressant.',
    'pets.title': 'Familiers',
    'pets.collection': 'Collection',
    'pets.team': 'Équipe active (3 max)',
    'history.clear': "Effacer l'historique",
    'saves.title': 'Sauvegardes',
    'saves.sub': 'Trois emplacements totalement indépendants. Exportez et importez au format JSON.',
    'saves.import': 'Importer une sauvegarde',
    'saves.import.sub': "Le fichier est analysé et validé avant utilisation. Aucun code n'est exécuté.",
    'saves.import.confirm': 'Importer dans cet emplacement',
    'saves.exportAll': 'Exporter le résumé des 3 emplacements',
    'saves.tools': 'Outils',
    'settings.title': 'Paramètres',
    'settings.ai': 'Service IA facultatif',
    'profile.title': 'Profil',
    'credits.title': 'Crédits',
    'common.cancel': 'Annuler',
    'common.confirm': 'Confirmer',
    'common.close': 'Fermer',
    'common.save': 'Enregistrer',
    'common.delete': 'Supprimer',
  },
  en: {
    'boot.loading': 'Loading catalog…',
    'nav.accueil': 'Home',
    'nav.jeu': 'Workshop',
    'nav.inventaire': 'Inventory',
    'nav.encyclopedie': 'Encyclopedia',
    'nav.quetes': 'Quests',
    'nav.mondes': 'Worlds',
    'nav.familiers': 'Pets',
    'nav.amis': 'Friends',
    'nav.historique': 'History',
    'nav.sauvegardes': 'Saves',
    'nav.parametres': 'Settings',
    'nav.profil': 'Profile',
    'nav.credits': 'Credits',
    'home.tagline': 'Combine Fire, Water, Earth and Wind to discover an infinite universe.',
    'home.play': 'Play',
    'home.continue': 'Continue',
    'home.new': 'New game',
    'home.saves': 'Saves',
    'home.quests': 'Quests',
    'home.collection': 'Collection',
    'home.pets': 'Pets',
    'home.friends': 'Friends',
    'home.friends.sub': 'Add a player (+10 potions)',
    'friends.title': 'Friends',
    'friends.inbox': 'Requests to review',
    'friends.sent': 'Sent requests',
    'friends.list': 'My friends',
    'friends.profile': 'Shared profiles',
    'friends.profile.inventory': 'Items and discoveries',
    'friends.profile.pets': 'Animals',
    'friends.profile.compare': 'You and your friend',
    'friends.refreshAll': 'Refresh all',
    'friends.code': 'Invitation code (no server)',
    'settings.friends': 'Optional friends relay',
    'home.settings': 'Settings',
    'home.tuto': 'Tutorial',
    'home.status': 'Game status',
    'board.center': 'Recenter',
    'board.clean': 'Clear board',
    'board.undo': 'Undo',
    'board.redo': 'Redo',
    'board.fuse': 'Merge',
    'board.palette': 'Available elements',
    'board.selection': 'Selection:',
    'board.clearSel': 'Clear',
    'quests.title': 'Quests',
    'quests.ach': 'Achievements',
    'worlds.title': 'Worlds',
    'pets.title': 'Pets',
    'pets.collection': 'Collection',
    'pets.team': 'Active team (max 3)',
    'history.clear': 'Clear history',
    'saves.title': 'Saves',
    'saves.import': 'Import a save',
    'saves.tools': 'Tools',
    'settings.title': 'Settings',
    'settings.ai': 'Optional AI service',
    'profile.title': 'Profile',
    'credits.title': 'Credits',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.save': 'Save',
  },
};

export const LANGUES = [
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
];

let langue = 'fr';

export function setLangue(code) {
  langue = DICT[code] ? code : 'fr';
  appliquerTraductions();
}

export function getLangue() {
  return langue;
}

/** Traduit une clé ; retourne la clé si absente (visible et donc corrigeable). */
export function t(cle, fallback) {
  return DICT[langue]?.[cle] ?? DICT.fr[cle] ?? fallback ?? cle;
}

/** Applique les traductions aux éléments portant data-i18n / data-i18n-ph. */
export function appliquerTraductions(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n, node.textContent);
  }
  for (const node of root.querySelectorAll('[data-i18n-ph]')) {
    node.setAttribute('placeholder', t(node.dataset.i18nPh, node.getAttribute('placeholder') || ''));
  }
  document.documentElement.lang = langue;
}
