import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliserPseudo, slugPseudo, identifiantJoueur, encoderCode, lireCode,
  etatVide, normaliserEtatAmis, estAmi, creerDemande, enregistrerDemandeEnvoyee,
  ajouterDemandeRecue, accepterDemande, refuserDemande, retirerAmi, annulerDemandeEnvoyee,
  creerReponse, traiterReponse, resumeAmis, POINTS_PAR_AMI, PREFIXE_CODE,
} from '../src/social/friends.js';
import { chargerConfigAmis, enregistrerConfigAmis, relaisDisponible, publierEvenement, recupererEvenements, urlRelais } from '../src/social/relay.js';
import relaisWorker from '../server/worker-amis.js';
import { AMIS } from '../src/config.js';

/* ---------- Faux stockage KV (Cloudflare) pour vérifier le relais fourni ---------- */

function kvFactice() {
  const memoire = new Map();
  return {
    async get(cle, type) {
      if (!memoire.has(cle)) return null;
      const valeur = memoire.get(cle);
      return type === 'json' ? JSON.parse(valeur) : valeur;
    },
    async put(cle, valeur) { memoire.set(cle, String(valeur)); },
    async delete(cle) { memoire.delete(cle); },
  };
}

/* ---------- Polyfill localStorage (les préférences d'amis y sont stockées) ---------- */
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
  clear: () => memoire.clear(),
};

/* ---------------------------- Identité ---------------------------- */

test('le pseudonyme est nettoyé et borné', () => {
  assert.equal(normaliserPseudo('  Alex   le   Grand '), 'Alex le Grand');
  assert.equal(normaliserPseudo(''), '');
  assert.equal(normaliserPseudo('x'.repeat(80)).length, AMIS.longueurPseudo);
});

test('l’identifiant de joueur est stable, lisible et distinct selon les pseudos', () => {
  const a = identifiantJoueur('Alex');
  assert.equal(a, identifiantJoueur('alex'));
  assert.match(a, /^alex-[a-z0-9]+$/);
  assert.notEqual(identifiantJoueur('Alex'), identifiantJoueur('Alexa'));
  assert.equal(slugPseudo('Élodie du Nord'), 'elodie-du-nord');
});

test('les codes d’invitation font l’aller-retour sans perte (accents compris)', () => {
  const objet = { type: 'demande', id: 'dem_1', de: { id: 'alex-1', nom: 'Aléxandre 🧪' }, vers: { id: 'bruno-2', nom: 'Bruno' } };
  const code = encoderCode(objet);
  assert.ok(code.startsWith(PREFIXE_CODE));
  const relu = lireCode(code);
  assert.equal(relu.ok, true);
  assert.deepEqual(relu.objet, objet);
});

test('un code illisible ou étranger est refusé proprement', () => {
  assert.equal(lireCode('').ok, false);
  assert.equal(lireCode('https://exemple.fr').ok, false);
  assert.equal(lireCode(`${PREFIXE_CODE}!!!`).ok, false);
});

/* ---------------------------- Demandes ---------------------------- */

test('une demande ne peut pas viser soi-même', () => {
  const r = creerDemande({ de: 'Alex', vers: ' alex ' });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /vous-même/i);
});

test('la demande porte l’expéditeur et le destinataire identifiés', () => {
  const r = creerDemande({ de: 'Alex', vers: 'Bruno' });
  assert.equal(r.ok, true);
  assert.equal(r.demande.de.id, identifiantJoueur('Alex'));
  assert.equal(r.demande.vers.id, identifiantJoueur('Bruno'));
  // Deux fois la même paire : même identifiant de demande (pas d'accumulation).
  assert.equal(creerDemande({ de: 'Alex', vers: 'Bruno' }).demande.id, r.demande.id);
});

test('une demande reçue apparaît une seule fois et peut être refusée', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno' }).demande;
  const r1 = ajouterDemandeRecue(etatVide(), demande, { moi: 'Bruno' });
  assert.equal(r1.ok, true);
  assert.equal(r1.etat.recues.length, 1);
  assert.equal(r1.etat.recues[0].de, identifiantJoueur('Alex'));

  const r2 = ajouterDemandeRecue(r1.etat, demande, { moi: 'Bruno' });
  assert.equal(r2.ok, false);
  assert.equal(r2.dejaPresente, true);

  const refuse = refuserDemande(r1.etat, demande.id);
  assert.equal(refuse.etat.recues.length, 0);
  // Une demande refusée ne revient plus, même si elle est relivrée par le relais.
  const r3 = ajouterDemandeRecue(refuse.etat, demande, { moi: 'Bruno' });
  assert.equal(r3.ok, false);
  assert.equal(r3.traitee, true);
});

test('une demande destinée à un autre joueur est refusée', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno' }).demande;
  const r = ajouterDemandeRecue(etatVide(), demande, { moi: 'Chloé' });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /pas destinée/i);
});

/* ---------------------------- Amis et potions ---------------------------- */

test('accepter une demande ajoute l’ami et donne 10 potions, une seule fois', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno' }).demande;
  const recue = ajouterDemandeRecue(etatVide(), demande, { moi: 'Bruno' });

  const res = accepterDemande(recue.etat, demande.id);
  assert.equal(res.ok, true);
  assert.equal(res.potions, POINTS_PAR_AMI);
  assert.equal(POINTS_PAR_AMI, 10);
  assert.equal(res.etat.liste.length, 1);
  assert.equal(res.etat.liste[0].nom, 'Alex');
  assert.equal(res.etat.recues.length, 0);
  assert.equal(estAmi(res.etat, identifiantJoueur('Alex')), true);

  // Le même ami ne rapporte plus rien, même en repassant par une nouvelle demande.
  const encore = accepterDemande(res.etat, demande.id);
  assert.equal(encore.ok, false);
  const reajout = accepterDemande(ajouterDemandeRecue(res.etat, demande, { moi: 'Bruno' }).etat || res.etat, demande.id);
  assert.equal(reajout.ok, false);
});

test('retirer puis rajouter un ami ne redonne pas 10 potions', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno', date: '2026-01-01T10:00:00.000Z' }).demande;
  const etat = accepterDemande(ajouterDemandeRecue(etatVide(), demande, { moi: 'Bruno' }).etat, demande.id).etat;
  const retire = retirerAmi(etat, identifiantJoueur('Alex')).etat;
  assert.equal(retire.liste.length, 0);

  // Alex renvoie une demande PLUS TARD (nouvelle date, même identifiant) : elle est
  // de nouveau proposée, mais la récompense n'est pas versée deux fois.
  const nouvelle = creerDemande({ de: 'Alex', vers: 'Bruno', date: '2026-02-01T10:00:00.000Z' }).demande;
  const recue = ajouterDemandeRecue(retire, nouvelle, { moi: 'Bruno' });
  assert.equal(recue.ok, true, recue.erreur);
  const re = accepterDemande(recue.etat, nouvelle.id);
  assert.equal(re.ok, true, re.erreur);
  assert.equal(re.potions, 0, 'la récompense d’un ami ne se prend qu’une fois');
});

test('un refus ne bloque pas une demande plus récente de la même personne', () => {
  const d1 = creerDemande({ de: 'Alex', vers: 'Bruno', date: '2026-01-01T10:00:00.000Z' }).demande;
  const etat = refuserDemande(ajouterDemandeRecue(etatVide(), d1, { moi: 'Bruno' }).etat, d1.id).etat;
  const d2 = creerDemande({ de: 'Alex', vers: 'Bruno', date: '2026-03-01T10:00:00.000Z' }).demande;
  const r = ajouterDemandeRecue(etat, d2, { moi: 'Bruno' });
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.etat.recues.length, 1);
});

test('la réponse d’un ami accepté est traitée une seule fois', () => {
  const reponse = creerReponse({ de: 'Bruno', vers: 'Alex' }).reponse;
  const envoi = enregistrerDemandeEnvoyee(etatVide(), creerDemande({ de: 'Alex', vers: 'Bruno' }).demande);
  assert.equal(envoi.ok, true);

  const r = traiterReponse(envoi.etat, reponse, { moi: 'Alex' });
  assert.equal(r.ok, true);
  assert.equal(r.potions, POINTS_PAR_AMI);
  assert.equal(r.etat.liste[0].nom, 'Bruno');
  assert.equal(r.etat.envoyees.length, 0, 'la demande envoyée est soldée');

  const r2 = traiterReponse(r.etat, reponse, { moi: 'Alex' });
  assert.equal(r2.potions, 0, 'la confirmation ne redonne pas de potions');
});

test('on ne peut pas envoyer une demande à quelqu’un de déjà ami', () => {
  // Bruno demande Alex : Alex accepte → Bruno est dans la liste d'amis d'Alex.
  const demande = creerDemande({ de: 'Bruno', vers: 'Alex' }).demande;
  const etat = accepterDemande(ajouterDemandeRecue(etatVide(), demande, { moi: 'Alex' }).etat, demande.id).etat;
  assert.equal(etat.liste[0].nom, 'Bruno');

  const r = enregistrerDemandeEnvoyee(etat, creerDemande({ de: 'Alex', vers: 'Bruno' }).demande);
  assert.equal(r.ok, false);
  assert.equal(r.dejaAmi, true);
});

test('une demande envoyée peut être annulée', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno' }).demande;
  const etat = enregistrerDemandeEnvoyee(etatVide(), demande).etat;
  assert.equal(etat.envoyees.length, 1);
  assert.equal(annulerDemandeEnvoyee(etat, demande.id).etat.envoyees.length, 0);
});

/* ---------------------------- Normalisation ---------------------------- */

test('l’état des amis est normalisé : doublons retirés, champs inconnus ignorés, bornes', () => {
  const brut = {
    liste: [
      { id: 'alex-1', nom: 'Alex', motDePasse: 'secret' },
      { id: 'alex-1', nom: 'Alex' },
      { id: 'bruno-2', nom: '' },
      'pas un objet',
    ],
    recues: [{ id: 'dem_1', nom: 'Chloé', de: 'chloe-3', extra: 'x' }],
    envoyees: [{ id: 'dem_2', nom: 'Dora', vers: 'dora-4' }],
    cadeaux: ['alex-1', 'alex-1'],
    inconnu: 'ignore',
  };
  const e = normaliserEtatAmis(brut);
  assert.equal(e.liste.length, 1);
  assert.deepEqual(Object.keys(e.liste[0]).sort(), ['avatar', 'date', 'id', 'nom']);
  assert.equal(e.recues.length, 1);
  // L'identifiant vient du PSEUDONYME, pas d'un identifiant annoncé (anti-usurpation).
  assert.equal(e.liste[0].id, identifiantJoueur('Alex'));
  assert.equal(e.recues[0].de, identifiantJoueur('Chloé'));
  assert.equal(e.envoyees[0].vers, identifiantJoueur('Dora'));
  assert.deepEqual(e.cadeaux, ['alex-1']);
  assert.equal('inconnu' in e, false);
});

test('un état corrompu ne fait pas planter le jeu', () => {
  assert.deepEqual(normaliserEtatAmis(null), etatVide());
  assert.deepEqual(normaliserEtatAmis('texte'), etatVide());
  assert.equal(resumeAmis(null).total, 0);
});

test('le résumé compte les potions gagnées grâce aux amis', () => {
  const demande = creerDemande({ de: 'Alex', vers: 'Bruno' }).demande;
  const etat = accepterDemande(ajouterDemandeRecue(etatVide(), demande, { moi: 'Bruno' }).etat, demande.id).etat;
  const res = resumeAmis(etat);
  assert.equal(res.total, 1);
  assert.equal(res.potionsGagnees, POINTS_PAR_AMI);
  assert.equal(res.potionsParAmi, 10);
});

/* ---------------------------- Relais facultatif ---------------------------- */

test('sans relais configuré, l’envoi est refusé avec un message clair', async () => {
  memoire.clear();
  assert.equal(relaisDisponible(), false);
  const r = await publierEvenement({ endpoint: '', evenement: {} });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Aucun relais/i);
  const lecture = await recupererEvenements({ endpoint: '', pour: 'alex-1' });
  assert.equal(lecture.ok, false);
  assert.deepEqual(lecture.evenements, []);
});

test('la configuration du relais est mémorisée et validée', () => {
  memoire.clear();
  const propre = enregistrerConfigAmis({ endpoint: 'https://relais.example.workers.dev/', actif: true, cle: 'jamais' });
  assert.deepEqual(Object.keys(propre).sort(), ['actif', 'endpoint']);
  assert.equal(chargerConfigAmis().endpoint, 'https://relais.example.workers.dev/');
  assert.equal(relaisDisponible(), true);
  assert.equal(urlRelais('https://relais.example.workers.dev///'), 'https://relais.example.workers.dev');
  // Une URL non http(s) ne suffit pas à activer le relais.
  enregistrerConfigAmis({ endpoint: 'ftp://exemple', actif: true });
  assert.equal(relaisDisponible(), false);
});

test('le client du relais respecte le contrat (POST puis GET)', async () => {
  const appels = [];
  const fetchFaux = async (url, options = {}) => {
    appels.push({ url, options });
    if (!options.method || options.method === 'GET') {
      return { ok: true, status: 200, async json() { return { evenements: [{ type: 'demande', id: 'dem_1', de: { id: 'alex-1', nom: 'Alex' }, vers: { id: 'bruno-2', nom: 'Bruno' } }] }; }, async text() { return ''; } };
    }
    return { ok: true, status: 200, async json() { return { ok: true }; }, async text() { return ''; } };
  };

  const envoi = await publierEvenement({
    endpoint: 'https://relais.example.workers.dev/',
    evenement: { type: 'demande', id: 'dem_1', de: { id: 'alex-1', nom: 'Alex' }, vers: { id: 'bruno-2', nom: 'Bruno' } },
    fetchImpl: fetchFaux,
  });
  assert.equal(envoi.ok, true);
  assert.equal(appels[0].url, 'https://relais.example.workers.dev');
  assert.equal(appels[0].options.method, 'POST');
  assert.equal(JSON.parse(appels[0].options.body).type, 'demande');

  const lecture = await recupererEvenements({ endpoint: 'https://relais.example.workers.dev', pour: 'bruno-2', fetchImpl: fetchFaux });
  assert.equal(lecture.ok, true);
  assert.equal(lecture.evenements.length, 1);
  assert.equal(appels[1].url, 'https://relais.example.workers.dev?pour=bruno-2');
});

test('un identifiant annoncé ne remplace jamais celui dérivé du pseudonyme', () => {
  // « Mallory » tente de se présenter avec l'identifiant d'Alex : impossible.
  const etat = ajouterDemandeRecue(etatVide(), {
    id: 'dem_usurpation',
    de: { id: identifiantJoueur('Alex'), nom: 'Mallory' },
    vers: { id: identifiantJoueur('Bruno'), nom: 'Bruno' },
    date: '2026-05-01T10:00:00.000Z',
  }, { moi: 'Bruno' });
  assert.equal(etat.ok, true, etat.erreur);
  assert.equal(etat.etat.recues[0].nom, 'Mallory');
  const ajoute = accepterDemande(etat.etat, 'dem_usurpation');
  assert.equal(ajoute.potions, POINTS_PAR_AMI);
  assert.equal(ajoute.etat.liste[0].id, identifiantJoueur('Mallory'));
  assert.equal(estAmi(ajoute.etat, identifiantJoueur('Alex')), false, 'Alex id n’est pas usurpable');
});

test('le relais fourni livre une demande au destinataire et une réponse à celui qui avait demandé', async () => {
  const env = { AMIS: kvFactice() };
  const alice = identifiantJoueur('Alice');
  const bruno = identifiantJoueur('Bruno');

  const poster = (corps) => relaisWorker.fetch(new Request('https://relais.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  }), env);
  const lire = async (pour) => {
    const res = await relaisWorker.fetch(new Request(`https://relais.example/?pour=${pour}`), env);
    return (await res.json()).evenements;
  };

  // 1. Alice demande Bruno en ami : c'est BRUNO qui est notifié.
  const demande = creerDemande({ de: 'Alice', vers: 'Bruno' }).demande;
  assert.equal((await (await poster({ type: 'demande', ...demande })).json()).ok, true);
  assert.equal((await lire(bruno)).length, 1);
  assert.deepEqual(await lire(alice), [], 'la demande ne doit pas revenir à son auteur');

  // 2. Bruno accepte : la réponse repart vers ALICE (et non vers Bruno).
  const reponse = creerReponse({ de: 'Bruno', vers: 'Alice' }).reponse;
  assert.equal((await (await poster({ type: 'reponse', ...reponse })).json()).ok, true);
  const pourAlice = await lire(alice);
  assert.equal(pourAlice.length, 1);
  assert.equal(pourAlice[0].type, 'reponse');
  assert.equal(pourAlice[0].de.nom, 'Bruno', 'la confirmation vient de l’ami qui a accepté');
  assert.equal((await lire(alice)).length, 0, 'chaque événement n’est livré qu’une fois');
  assert.deepEqual(await lire(bruno), [], 'une réponse ne revient pas à celui qui l’envoie');
});

test('le relais fourni refuse les entrées invalides sans rien stocker', async () => {
  const env = { AMIS: kvFactice() };
  const poster = async (corps) => {
    const res = await relaisWorker.fetch(new Request('https://relais.example/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    }), env);
    return { statut: res.status, corps: await res.json() };
  };

  assert.equal((await poster({ type: 'autre', de: { id: 'a-1', nom: 'A' }, vers: { id: 'b-2', nom: 'B' } })).statut, 400);
  assert.equal((await poster({ type: 'demande', de: { id: 'a-1', nom: 'A' }, vers: { id: 'b-2' } })).statut, 400, 'un destinataire sans pseudonyme est refusé');
  assert.equal((await poster({ type: 'demande', de: { id: 'a-1', nom: 'A' }, vers: { id: 'a-1', nom: 'A' } })).statut, 400, 'on ne s’écrit pas à soi-même');

  const sansKv = await relaisWorker.fetch(new Request('https://relais.example/?pour=a-1'), {});
  assert.equal(sansKv.status, 500, 'sans stockage KV, le relais le dit clairement');
});

test('un relais en panne ne casse pas le jeu', async () => {
  const fetchCasse = async () => { throw new Error('réseau coupé'); };
  const envoi = await publierEvenement({ endpoint: 'https://relais.example', evenement: {}, fetchImpl: fetchCasse });
  assert.equal(envoi.ok, false);
  assert.match(envoi.erreur, /réseau/i);
  const lecture = await recupererEvenements({ endpoint: 'https://relais.example', pour: 'alex-1', fetchImpl: fetchCasse });
  assert.equal(lecture.ok, false);
  assert.deepEqual(lecture.evenements, []);
});
