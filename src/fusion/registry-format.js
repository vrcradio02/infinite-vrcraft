/**
 * Codec du registre officiel des fusions.
 *
 * Le registre est stocké en format COMPACT pour rester léger à télécharger :
 *   {
 *     "meta": { ... },
 *     "manifest": { ... },
 *     "elements": { "feu": [nom, categorie, rarete, monde, emoji, description] },
 *     "recipes":    [ [id, a, b, resultat, lot] ],   // recettes officielles
 *     "candidates": [ [id, a, b, resultat, lot] ]    // recettes candidates (non officielles)
 *   }
 *
 * `expandRegistre()` le transforme en structures complètes utilisables par le moteur.
 * La catégorie et la rareté d'une recette sont TOUJOURS dérivées de son élément résultat :
 * une incohérence entre recette et élément est donc impossible par construction.
 */

/**
 * Vrai si le registre est déjà au format développé.
 * Attention : au format compact, `recipes[0]` est un TABLEAU (donc `typeof` vaut 'object').
 * Il faut donc explicitement exclure les tableaux.
 */
export function estDeveloppe(brut) {
  const premier = brut?.recipes?.[0];
  return Boolean(
    brut
    && brut.elements
    && Array.isArray(brut.recipes)
    && premier
    && typeof premier === 'object'
    && !Array.isArray(premier),
  );
}

/**
 * Développe un registre compact en structures complètes.
 * Accepte aussi un registre déjà développé (retourné tel quel).
 */
export function expandRegistre(brut) {
  if (estDeveloppe(brut)) return brut;

  const elements = {};
  for (const [id, t] of Object.entries(brut?.elements || {})) {
    if (!Array.isArray(t) || t.length < 5) continue;
    const [nom, categorie, rarete, monde, emoji, description = ''] = t;
    elements[id] = { id, nom, categorie, rarete, monde, emoji, description };
  }

  const recipes = [];
  const ajouter = (liste, source) => {
    for (const entree of liste || []) {
      if (!Array.isArray(entree) || entree.length < 4) continue;
      const [id, a, b, result, lot = 'inconnu'] = entree;
      const meta = elements[result];
      if (!meta) continue;
      recipes.push({
        id,
        key: a <= b ? `${a}|${b}` : `${b}|${a}`,
        a, b, result,
        ordered: false,
        categorie: meta.categorie,
        rarete: meta.rarete,
        monde: meta.monde,
        source,
        statut: source === 'officiel' ? 'officiel' : 'candidat',
        valide: true,
        version: 1,
        lot,
      });
    }
  };
  ajouter(brut?.recipes, 'officiel');
  ajouter(brut?.candidates, 'candidat');

  return { meta: brut?.meta || {}, manifest: brut?.manifest || {}, elements, recipes };
}
