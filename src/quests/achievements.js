/**
 * Succès : objectifs permanents évalués à partir des statistiques de la partie.
 * Les définitions sont déclaratives ; l'évaluation est pure (testable).
 */

export const SUCCES = [
  { id: 'premiere-fusion', nom: 'Première fusion', description: 'Réaliser votre toute première fusion.', condition: (s) => s.stats.fusionsTentees >= 1 },
  { id: 'cent-decouvertes', nom: 'Cent découvertes', description: 'Découvrir 100 éléments.', condition: (s) => s.stats.decouvertes >= 100 },
  { id: 'cinquante-decouvertes', nom: 'Explorateur', description: 'Découvrir 50 éléments.', condition: (s) => s.stats.decouvertes >= 50 },
  { id: 'explorateur-des-mondes', nom: 'Explorateur des mondes', description: 'Débloquer 4 mondes.', condition: (s) => Object.values(s.mondes || {}).filter(Boolean).length >= 4 },
  { id: 'collectionneur', nom: 'Collectionneur', description: 'Compléter au moins une collection thématique.', condition: (s) => Object.values(s.collections || {}).some((c) => c.complete) },
  { id: 'maitre-des-familiers', nom: 'Maître des familiers', description: 'Posséder 6 familiers.', condition: (s) => Object.keys(s.familiers || {}).length >= 6 },
  { id: 'niveau-10', nom: 'Alchimiste confirmé', description: 'Atteindre le niveau 10.', condition: (s) => s.niveau >= 10 },
  { id: 'niveau-25', nom: 'Savant des éléments', description: 'Atteindre le niveau 25.', condition: (s) => s.niveau >= 25 },
  { id: 'premiere-quete', nom: 'Aventurier', description: 'Terminer une quête.', condition: (s) => s.stats.quetesTerminees >= 1 },
  { id: 'experimentateur', nom: 'Expérimentateur', description: 'Réussir 10 créations expérimentales.', condition: (s) => (s.stats.experimentales || 0) >= 10 },
  { id: 'mille-fusions', nom: 'Machine à fusionner', description: 'Tenter 1000 fusions.', condition: (s) => s.stats.fusionsTentees >= 1000 },
  { id: 'toutes-rarretes', nom: 'Chasseur de légendes', description: 'Découvrir un élément Légendaire ou plus rare.', condition: (s) => Object.values(s.decouvertes || {}).some((d) => ['Légendaire', 'Mythique', 'Cosmique', 'Secret'].includes(d.rarete)) },
];

/**
 * Évalue tous les succès non encore obtenus.
 * @param {object} sauvegarde
 * @returns {{id:string, nom:string, description:string}[]} succès nouvellement débloqués
 */
export function evaluerSucces(sauvegarde) {
  const dejaOk = sauvegarde.succes || {};
  const nouveaux = [];
  for (const s of SUCCES) {
    if (dejaOk[s.id]) continue;
    let ok = false;
    try {
      ok = Boolean(s.condition(sauvegarde));
    } catch {
      ok = false;
    }
    if (ok) nouveaux.push({ id: s.id, nom: s.nom, description: s.description });
  }
  return nouveaux;
}
