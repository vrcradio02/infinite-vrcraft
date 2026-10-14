/**
 * Validation des propositions de recettes issues de l'IA (étape 87).
 * Règles vérifiées :
 *  - les ingrédients de la demande sont bien respectés (le proxy ne peut pas renvoyer
 *    n'importe quoi pour d'autres ingrédients),
 *  - le résultat est non vide et de type correct,
 *  - les limites de longueur sont respectées (protection contre les injections/abus),
 *  - on n'accepte aucun champ exécutable.
 */
export const LIMITES_PROPOSITION = {
  maxNom: 60,
  maxDescription: 300,
  maxCategorie: 40,
};

const RARETES_OK = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire', 'Mythique', 'Cosmique', 'Secret'];

/** Nettoie une chaîne : retire les caractères de contrôle, borne la taille. */
export function nettoyerTexte(valeur, max) {
  return String(valeur ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * @param {any} data réponse du service
 * @param {{a:string,b:string,nomA?:string,nomB?:string}} demande
 * @returns {{ok:true, proposition:object}|{ok:false, erreur:string}}
 */
export function validerProposition(data, demande) {
  if (!data || typeof data !== 'object') return { ok: false, erreur: 'Réponse invalide du service IA.' };

  const source = data.resultat && typeof data.resultat === 'object' ? data.resultat : data;

  // Vérifie que les ingrédients annoncés correspondent à la demande (si fournis).
  if (source.a !== undefined && String(source.a) !== String(demande.a)) {
    return { ok: false, erreur: 'Les ingrédients renvoyés ne correspondent pas à la demande.' };
  }
  if (source.b !== undefined && String(source.b) !== String(demande.b)) {
    return { ok: false, erreur: 'Les ingrédients renvoyés ne correspondent pas à la demande.' };
  }

  const nom = nettoyerTexte(source.nom ?? source.resultat, LIMITES_PROPOSITION.maxNom);
  if (!nom) return { ok: false, erreur: 'Le service IA a renvoyé un résultat vide.' };

  const description = nettoyerTexte(source.description, LIMITES_PROPOSITION.maxDescription);
  const categorie = nettoyerTexte(source.categorie, LIMITES_PROPOSITION.maxCategorie) || 'expérimental';
  const rarete = RARETES_OK.includes(source.rarete) ? source.rarete : 'Peu commun';

  if (nom.length < 2) return { ok: false, erreur: 'Résultat trop court pour être exploitable.' };

  return {
    ok: true,
    proposition: {
      id: `ia-${String(demande.a)}-${String(demande.b)}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
      nom,
      description: description || `Proposition expérimentale issue de « ${demande.nomA ?? demande.a} » et « ${demande.nomB ?? demande.b} ».`,
      categorie,
      rarete,
      experimental: true,
      source: 'ia',
    },
  };
}
