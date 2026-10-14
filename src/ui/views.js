/**
 * Rendu des écrans : accueil, inventaire, encyclopédie, historique, quêtes,
 * mondes/collections, familiers, sauvegardes, paramètres, profil, crédits, tutoriel.
 */
import { $, el, clear } from '../core/dom.js';
import { RARETES, EQUIPE_MAX, NB_SAUVEGARDES } from '../config.js';
import { toast, ouvrirModale, confirmer, demanderTexte } from './shell.js';
import { SUCCES } from '../quests/achievements.js';
import { TYPES_AIDE } from '../pets/help.js';
import { etatCollections } from '../game/collections.js';
import { descriptionCondition } from '../game/mondes.js';
import { xpFamilerPourNiveau, niveauFamilier } from '../pets/pets.js';
import { formatDuree } from '../game/game.js';

const RARE_SLUG = (r) => 'rare-' + String(r).replace(/\s+/g, '-');

export class Vues {
  constructor({ jeu, plateau, onAction }) {
    this.jeu = jeu;
    this.plateau = plateau;
    this.onAction = onAction;
    this._timerQuota = null;
    this._elTimer = null;
  }

  /** Point d'entrée : rafraîchit l'écran demandé. */
  rendre(nom) {
    switch (nom) {
      case 'accueil': return this.accueil();
      case 'jeu': return this.atelier();
      case 'inventaire': return this.inventaire();
      case 'encyclopedie': return this.encyclopedie();
      case 'quetes': return this.quetes();
      case 'mondes': return this.mondes();
      case 'familiers': return this.familiers();
      case 'historique': return this.historique();
      case 'sauvegardes': return this.sauvegardes();
      case 'parametres': return this.parametres();
      case 'profil': return this.profil();
      case 'credits': return this.credits();
      default: return undefined;
    }
  }

  get save() { return this.jeu.save; }
  nom(id) { return this.jeu.store.elements.get(id)?.nom ?? id; }
  emoji(id) { return this.jeu.store.elements.get(id)?.emoji ?? '✨'; }
  meta(id) { return this.jeu.store.elements.get(id); }

  /* ===================== ACCUEIL ===================== */

  async accueil() {
    const resume = await this.jeu.resume();
    const liste = $('#home-status-list');
    clear(liste);
    const lignes = [
      ['Catalogue officiel', `${resume.recettesOfficielles} recettes · ${resume.elements} éléments`],
      ['Partie en cours', this.save ? `${this.save.nom} — niveau ${this.save.niveau}` : 'Aucune partie chargée'],
      ['Emplacements occupés', `${resume.slots.filter((s) => s.existe).length} / ${NB_SAUVEGARDES}`],
      ['Service IA', resume.iaDisponible ? 'Configuré (facultatif)' : 'Non configuré — mode expérimental local'],
      ['Mode hors ligne', 'Disponible après le premier chargement'],
    ];
    for (const [k, v] of lignes) {
      liste.append(el('li', {}, [el('span', { text: k }), el('span', { text: v })]));
    }
    const sub = $('#home-continue-sub');
    const dernier = resume.slots.find((s) => s.slot === resume.dernier && s.existe) || resume.slots.find((s) => s.existe);
    sub.textContent = dernier ? `${dernier.nom} — niveau ${dernier.niveau} (emplacement ${dernier.slot + 1})` : 'Aucune sauvegarde';
    const boutonContinuer = $('[data-action="continuer"]');
    if (boutonContinuer) boutonContinuer.disabled = !dernier;
    this.majTopbar();
  }

  majTopbar() {
    const zone = $('#topbar-stats');
    clear(zone);
    if (!this.save) {
      zone.append(el('span', { text: 'Aucune partie' }));
      return;
    }
    const st = this.jeu.statistiques();
    zone.append(
      el('span', {}, [el('b', { text: this.save.nom })]),
      el('span', {}, ['Niv. ', el('b', { text: String(st.niveau) }), ` · ${st.titre}`]),
      el('span', {}, ['Découvertes ', el('b', { text: String(st.decouvertes) }), `/ ${st.totalElements}`]),
      el('span', {}, ['XP ', el('b', { text: String(st.xp) })]),
    );
  }

  /* ===================== ATELIER ===================== */

  atelier() {
    this.plateau.rendre();
    this.majTopbar();
  }

  /* ===================== INVENTAIRE ===================== */

  inventaire() {
    const grille = $('#inv-grid');
    clear(grille);
    if (!this.save) return this._vide(grille);

    this._remplirSelect($('#inv-cat'), 'Toutes les catégories', [...new Set([...this.jeu.store.elements.values()].map((e) => e.categorie))].sort());
    this._remplirSelect($('#inv-rare'), 'Toutes les raretés', RARETES);

    const rendre = () => {
      const q = $('#inv-search').value.trim().toLowerCase();
      const cat = $('#inv-cat').value;
      const rare = $('#inv-rare').value;
      const tri = $('#inv-sort').value;

      const ids = Object.keys(this.save.decouvertes).filter((id) => this.jeu.store.elements.has(id));
      let items = ids.map((id) => ({ id, meta: this.meta(id), d: this.save.decouvertes[id] }));

      if (q) items = items.filter((i) => i.meta.nom.toLowerCase().includes(q) || (i.meta.description || '').toLowerCase().includes(q));
      if (cat) items = items.filter((i) => i.meta.categorie === cat);
      if (rare) items = items.filter((i) => i.meta.rarete === rare);

      switch (tri) {
        case 'alpha': items.sort((a, b) => a.meta.nom.localeCompare(b.meta.nom, 'fr')); break;
        case 'rarete': items.sort((a, b) => RARETES.indexOf(b.meta.rarete) - RARETES.indexOf(a.meta.rarete)); break;
        case 'categorie': items.sort((a, b) => a.meta.categorie.localeCompare(b.meta.categorie, 'fr')); break;
        default: items.sort((a, b) => String(b.d.date).localeCompare(String(a.d.date)));
      }

      clear(grille);
      for (const i of items) grille.append(this._carteElement(i.meta));
      $('#inv-count').textContent = `${items.length} élément(s) affiché(s) sur ${Object.keys(this.save.decouvertes).length} découvert(s).`;
    };

    $('#inv-search').oninput = rendre;
    $('#inv-cat').onchange = rendre;
    $('#inv-rare').onchange = rendre;
    $('#inv-sort').onchange = rendre;
    rendre();
  }

  _carteElement(meta) {
    return el('button', {
      class: `item ${RARE_SLUG(meta.rarete)}`,
      title: `${meta.nom} — ${meta.categorie} / ${meta.rarete}. Cliquer pour ajouter au plateau.`,
      onClick: () => {
        this.plateau.ajouterElement(meta.id);
        this.onAction('jeu');
      },
    }, [
      el('span', { class: 'title' }, [
        el('span', { 'aria-hidden': 'true', text: meta.emoji || '✨' }),
        el('span', { text: meta.nom }),
      ]),
      el('span', { class: 'meta' }, [el('span', { class: 'badge', text: meta.rarete }), ' ', meta.categorie]),
      el('span', { class: 'meta', text: meta.description || '' }),
    ]);
  }

  /* ===================== ENCYCLOPEDIE ===================== */

  encyclopedie() {
    const liste = $('#enc-list');
    clear(liste);
    if (!this.save) return this._vide(liste);

    this._remplirSelect($('#enc-cat'), 'Toutes les catégories', [...new Set([...this.jeu.store.elements.values()].map((e) => e.categorie))].sort());
    this._remplirSelect($('#enc-rare'), 'Toutes les raretés', RARETES);
    this._remplirSelect($('#enc-monde'), 'Tous les mondes', [...new Set([...this.jeu.store.elements.values()].map((e) => e.monde))].sort());

    const rendre = () => {
      const q = $('#enc-search').value.trim().toLowerCase();
      const cat = $('#enc-cat').value;
      const rare = $('#enc-rare').value;
      const monde = $('#enc-monde').value;
      const date = $('#enc-date').value;
      const connu = $('#enc-known').value;

      let items = [...this.jeu.store.elements.values()];
      if (q) items = items.filter((m) => m.nom.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q) || this._recettesTexte(m.id).toLowerCase().includes(q));
      if (cat) items = items.filter((m) => m.categorie === cat);
      if (rare) items = items.filter((m) => m.rarete === rare);
      if (monde) items = items.filter((m) => m.monde === monde);
      if (date) {
        const seuil = date === 'today' ? Date.now() - 86400000 : Date.now() - 7 * 86400000;
        items = items.filter((m) => {
          const d = this.save.decouvertes[m.id]?.date;
          return d && Date.parse(d) >= seuil;
        });
      }
      if (connu === 'yes') items = items.filter((m) => this.save.decouvertes[m.id]);
      if (connu === 'no') items = items.filter((m) => !this.save.decouvertes[m.id]);

      items.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      clear(liste);
      for (const m of items) liste.append(this._ligneEncyclopedie(m));

      const decouverts = Object.keys(this.save.decouvertes).length;
      $('#enc-count').textContent = `${items.length} élément(s) affiché(s). Collection : ${decouverts} / ${this.jeu.store.nombreElements} découverts.`;
    };

    for (const sel of ['#enc-search', '#enc-cat', '#enc-rare', '#enc-monde', '#enc-date', '#enc-known']) {
      const n = $(sel);
      n.oninput = rendre;
      n.onchange = rendre;
    }
    rendre();
  }

  _recettesTexte(elementId) {
    const recettes = this.jeu.store.recettesVers(elementId);
    return recettes.map((r) => `${this.nom(r.a)} ${this.nom(r.b)}`).join(' ');
  }

  _ligneEncyclopedie(meta) {
    const connu = Boolean(this.save.decouvertes[meta.id]);
    const recettes = this.jeu.store.recettesVers(meta.id);
    const bloc = el('div', { class: `item ${RARE_SLUG(meta.rarete)} ${connu ? '' : 'locked'}` }, [
      el('div', { class: 'enc-row' }, [
        el('span', { class: 'title' }, [
          el('span', { 'aria-hidden': 'true', text: connu ? (meta.emoji || '✨') : '❔' }),
          el('span', { text: connu ? meta.nom : '???' }),
        ]),
        el('span', { class: 'badge', text: meta.rarete }),
      ]),
      el('div', { class: 'meta', text: `${meta.categorie} · monde ${meta.monde}` }),
      el('div', { class: 'meta', text: connu ? (meta.description || '') : 'Élément non découvert.' }),
    ]);

    if (connu && recettes.length) {
      bloc.append(el('details', {}, [
        el('summary', { text: `Recettes connues (${recettes.length})` }),
        el('div', { class: 'recipes-known' }, recettes.slice(0, 8).map((r) => el('span', { text: `${this.emoji(r.a)} ${this.nom(r.a)} + ${this.emoji(r.b)} ${this.nom(r.b)}` }))),
      ]));
    } else if (connu) {
      bloc.append(el('div', { class: 'meta', text: 'Élément de départ ou recette secrète.' }));
    }
    return bloc;
  }

  /* ===================== HISTORIQUE ===================== */

  historique() {
    const zone = $('#hist-body');
    clear(zone);
    if (!this.save) return this._vide(zone);

    const rendre = () => {
      const f = $('#hist-filter').value;
      clear(zone);
      const entrees = this.save.historique.filter((h) => !f || h.statut === f).slice(0, 400);
      if (!entrees.length) { zone.append(el('p', { class: 'muted', text: 'Aucune fusion enregistrée.' })); return; }
      for (const h of entrees) {
        zone.append(el('div', { class: 'item' }, [
          el('div', { class: 'title' }, [
            el('span', { text: `${this.emoji(h.a)} ${h.nomA}` }),
            el('span', { text: '+' }),
            el('span', { text: `${this.emoji(h.b)} ${h.nomB}` }),
            el('span', { text: '=' }),
            el('span', { text: h.resultat ? `${h.resultat}` : '∅' }),
          ]),
          el('div', { class: 'meta', text: `${new Date(h.date).toLocaleString('fr-FR')} · mode ${h.mode} · statut ${h.statut}` }),
        ]));
      }
    };
    $('#hist-filter').onchange = rendre;
    $('#btn-hist-clear').onclick = async () => {
      if (!await confirmer({ titre: 'Effacer l\'historique', message: 'Cette action n\'efface PAS vos découvertes. Continuer ?', labelOk: 'Effacer', danger: true })) return;
      this.save.historique = [];
      await this.jeu.sauvegarder();
      rendre();
      toast('Historique effacé.', 'info');
    };
    rendre();
  }

  /* ===================== QUETES ===================== */

  quetes() {
    const zone = $('#quests-body');
    clear(zone);
    if (!this.save) return this._vide(zone);
    const q = this.save.quetes;

    const sections = [
      ['Quêtes quotidiennes', q.quotidiennes, 'quotidiennes'],
      ['Quêtes hebdomadaires', q.hebdomadaires, 'hebdomadaires'],
      ['Aventures scénarisées', q.scenarisees, 'scenarisees'],
    ];

    for (const [titre, liste, scope] of sections) {
      zone.append(el('h3', { text: titre }));
      const conteneur = el('div', { class: 'grid grid-auto' });
      if (!liste?.length) conteneur.append(el('p', { class: 'muted', text: 'Rien pour le moment.' }));
      for (const quete of liste || []) conteneur.append(this._carteQuete(quete, scope));
      zone.append(conteneur);
    }

    const ach = $('#ach-body');
    clear(ach);
    for (const s of SUCCES) {
      const obtenu = Boolean(this.save.succes[s.id]);
      ach.append(el('div', { class: `item ${obtenu ? '' : 'locked'}` }, [
        el('span', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: obtenu ? '🏅' : '🔒' }), el('span', { text: s.nom })]),
        el('span', { class: 'meta', text: s.description }),
        el('span', { class: 'meta', text: obtenu ? `Obtenu le ${new Date(this.save.succes[s.id]).toLocaleDateString('fr-FR')}` : 'Non obtenu' }),
      ]));
    }
  }

  _carteQuete(quete, scope) {
    const objectif = quete.objectif || quete.etapes?.length || 1;
    const progression = quete.objectif ? (quete.progression || 0) : (quete.etape || 0);
    const ratio = Math.min(1, progression / objectif);
    const carte = el('div', { class: `quest ${quete.terminee ? 'done' : ''} ${quete.reclamee ? 'claimed' : ''}` }, [
      el('h4', { text: quete.nom }),
      el('p', { class: 'muted', text: quete.description || '' }),
      el('div', { class: 'progress' }, [el('span', { style: { width: `${Math.round(ratio * 100)}%` } })]),
      el('div', { class: 'meta', text: `${progression} / ${objectif} · récompense ${quete.recompense?.xp ?? 0} XP` }),
    ]);
    if (scope === 'scenarisees') {
      const etape = quete.etapes?.[quete.etape];
      if (etape) carte.append(el('div', { class: 'meta', text: `Étape en cours : ${etape.nom} — ${etape.description}` }));
      if (quete.personnages?.length) {
        carte.append(el('div', { class: 'meta', text: `${quete.personnages[0].emoji} ${quete.personnages[0].nom} : « ${quete.personnages[0].replique} »` }));
      }
    }
    if (quete.terminee && !quete.reclamee) {
      carte.append(el('button', {
        class: 'btn btn-primary btn-sm',
        onClick: async () => {
          const r = this.jeu.reclamerQuete(scope, quete.id);
          if (r.ok) { toast(`Récompense : +${r.xp} XP`, 'good'); this.quetes(); this.majTopbar(); }
          else toast(r.erreur, 'warn');
          await this.jeu.sauvegarder();
        },
      }, ['Réclamer la récompense']));
    }
    if (quete.reclamee) carte.append(el('div', { class: 'meta good', text: '✔ Récompense obtenue' }));
    return carte;
  }

  /* ===================== MONDES + COLLECTIONS ===================== */

  mondes() {
    const zone = $('#worlds-body');
    clear(zone);
    if (!this.save) return this._vide(zone);
    for (const m of this.jeu.etatMondes()) {
      const carte = el('div', { class: `item ${m.debloque ? '' : 'locked'}` }, [
        el('span', { class: 'title' }, [
          el('span', { style: { fontSize: '1.5rem' }, 'aria-hidden': 'true', text: m.debloque ? m.emoji : '🔒' }),
          el('span', { text: m.nom }),
        ]),
        el('span', { class: 'meta', text: m.description }),
        el('span', { class: 'meta', text: `Thèmes : ${(m.themes || []).join(', ')}` }),
        el('span', { class: 'meta', text: m.debloque ? '✔ Débloqué' : `Condition : ${descriptionCondition(m)}` }),
      ]);
      if (m.debloque) carte.append(el('div', { class: 'meta good', text: 'Accessible' }));
      zone.append(carte);
    }

    zone.append(el('h3', { text: 'Collections thématiques' }));
    for (const c of etatCollections(this.jeu.collections, this.save)) {
      zone.append(el('div', { class: `item ${c.complete ? '' : 'locked'}` }, [
        el('span', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: c.collection.emoji }), el('span', { text: c.collection.nom })]),
        el('div', { class: 'progress' }, [el('span', { style: { width: `${Math.round(c.ratio * 100)}%` } })]),
        el('span', { class: 'meta', text: `${c.possedes.length} / ${c.collection.elements.length} · ${c.complete ? 'complète' : 'incomplète'}` }),
        el('span', { class: 'meta', text: `Manquants : ${c.manquants.slice(0, 10).map((id) => this.nom(id)).join(', ') || 'aucun'}` }),
      ]));
    }
  }

  /* ===================== FAMILIERS ===================== */

  familiers() {
    if (!this.save) return;
    this._rendreQuota();
    this._rendreActionsAide();
    this._rendreCollectionPets();
    this._rendreEquipe();
  }

  _rendreQuota() {
    const carte = $('#quota-card');
    clear(carte);
    const etat = this.jeu.etatQuota();
    const minuteur = el('div', { class: 'meta', text: etat.tempsRestant > 0 ? `Prochaine recharge dans ${formatDuree(etat.tempsRestant)}` : 'Quota plein.' });
    carte.append(el('div', {}, [
      el('div', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: '⏱️' }), el('span', { text: `Aides : ${etat.restant} / ${etat.max}` })]),
      el('div', { class: 'meta', text: 'Quota commun à tous les familiers et à tous les types d\'aide (5 par 10 minutes).' }),
      minuteur,
    ]));
    const pips = el('div', { class: 'quota-pips', 'aria-hidden': 'true' });
    for (let i = 0; i < etat.max; i++) pips.append(el('span', { class: `pip ${i < etat.restant ? 'on' : ''}` }));
    carte.append(pips);
    clearInterval(this._timerQuota);
    this._timerQuota = setInterval(() => {
      const e2 = this.jeu.etatQuota();
      minuteur.textContent = e2.tempsRestant > 0 ? `Prochaine recharge dans ${formatDuree(e2.tempsRestant)}` : 'Quota plein.';
    }, 1000);
  }

  _rendreActionsAide() {
    const zone = $('#help-actions');
    clear(zone);
    const equipe = this.save.equipe.filter((id) => this.save.familiers[id]);
    if (!equipe.length) {
      zone.append(el('p', { class: 'muted', text: 'Équipez au moins un familier pour utiliser les aides.' }));
    }
    const select = el('select', { class: 'input', 'aria-label': 'Familier qui aide' },
      (equipe.length ? equipe : ['']).map((id) => el('option', {
        value: id,
        text: id ? `${this._petDef(id)?.emoji || ''} ${this._petDef(id)?.nom || id} (niv. ${this.save.familiers[id]?.niveau || 1})` : '—',
      })));
    zone.append(el('div', { class: 'card' }, [
      el('h3', { text: 'Utiliser une aide' }),
      el('div', { class: 'row' }, [select]),
    ]));

    const actions = el('div', { class: 'grid grid-3 card' });
    for (const t of TYPES_AIDE) {
      actions.append(el('button', {
        class: 'action-card',
        onClick: () => this._demanderAide(t.id, select.value),
      }, [
        el('span', { class: 'big', 'aria-hidden': 'true', text: t.emoji }),
        el('b', { text: t.nom }),
        el('small', { text: t.description }),
      ]));
    }
    zone.append(actions);
  }

  _demanderAide(type, familierId) {
    const r = this.jeu.utiliserAide(type, { familierId });
    if (!r.ok) { toast(r.erreur, r.consomme ? 'warn' : 'bad'); this._rendreQuota(); return; }
    toast(`${r.emoji} ${r.familier} : ${r.texte}`, 'good', 9000);
    this._rendreQuota();
    this.familiers();
    this.majTopbar();
  }

  _petDef(id) { return this.jeu.petIndex.get(id); }

  _rendreCollectionPets() {
    const zone = $('#pets-body');
    clear(zone);
    for (const def of this.jeu.pets) {
      const etat = this.save.familiers[def.id];
      const possede = Boolean(etat);
      const niveau = etat ? etat.niveau : 1;
      const info = etat ? niveauFamilier(etat.xp) : { dansNiveau: 0, requis: xpFamilerPourNiveau(1) };
      const competences = (def.competences || []).filter((c) => possede && niveau >= (c.niveauRequis || 1));

      const carte = el('div', { class: `item pet ${etat?.equipe ? 'equipped' : ''} ${possede ? '' : 'locked'}` }, [
        el('div', { class: 'title' }, [el('span', { class: 'avatar', 'aria-hidden': 'true', text: def.emoji }), el('span', { text: def.nom })]),
        el('span', { class: 'badge', text: def.rarete }),
        el('span', { class: 'meta', text: `Spécialité : ${def.specialite}` }),
        el('span', { class: 'meta', text: def.description }),
        el('span', { class: 'meta', text: possede ? `Niveau ${niveau} · ${info.dansNiveau}/${info.requis} XP` : 'Non possédé' }),
        el('span', { class: 'meta', text: competences.length ? `Compétences : ${competences.map((c) => c.nom).join(', ')}` : `Compétences à débloquer : ${(def.competences || []).map((c) => `${c.nom} (niv. ${c.niveauRequis})`).join(', ')}` }),
      ]);

      if (possede) {
        carte.append(el('div', { class: 'row' }, [
          etat.equipe
            ? el('button', { class: 'btn btn-sm', onClick: () => { this.jeu.retirerFamilier(def.id); this.familiers(); this.jeu.sauvegarder(); } }, ['Retirer de l\'équipe'])
            : el('button', { class: 'btn btn-sm btn-primary', onClick: () => {
                const r = this.jeu.equiperFamilier(def.id);
                if (!r.ok) toast(r.erreur, 'warn'); else this.familiers();
                this.jeu.sauvegarder();
              } }, ['Ajouter à l\'équipe']),
        ]));
      } else {
        carte.append(el('span', { class: 'meta', text: 'Déblocage : progressez (découvertes, niveaux) pour l\'obtenir.' }));
      }
      zone.append(carte);
    }
  }

  _rendreEquipe() {
    const zone = $('#pets-team');
    clear(zone);
    const equipe = this.save.equipe || [];
    if (!equipe.length) zone.append(el('p', { class: 'muted', text: 'Aucun familier équipé.' }));
    for (const id of equipe) {
      const def = this._petDef(id);
      const etat = this.save.familiers[id];
      if (!def || !etat) continue;
      zone.append(el('div', { class: 'item pet equipped' }, [
        el('div', { class: 'title' }, [el('span', { class: 'avatar', 'aria-hidden': 'true', text: def.emoji }), el('span', { text: def.nom })]),
        el('span', { class: 'meta', text: `Niveau ${etat.niveau} · ${def.specialite}` }),
      ]));
    }
    zone.append(el('p', { class: 'muted', text: `Équipe active : ${equipe.length} / ${EQUIPE_MAX}.` }));
  }

  /* ===================== SAUVEGARDES ===================== */

  async sauvegardes() {
    const zone = $('#saves-body');
    clear(zone);
    const slots = await this.jeu.saves.lister();

    for (const s of slots) {
      const carte = el('div', { class: `card slot ${s.existe ? '' : 'empty'}` });
      carte.append(el('h3', { text: `Sauvegarde ${s.slot + 1}` }));
      if (s.existe) {
        carte.append(el('ul', { class: 'kv' }, [
          el('li', {}, [el('span', { text: 'Pseudonyme' }), el('span', { text: s.nom })]),
          el('li', {}, [el('span', { text: 'Niveau' }), el('span', { text: String(s.niveau) })]),
          el('li', {}, [el('span', { text: 'Découvertes' }), el('span', { text: String(s.decouvertes) })]),
          el('li', {}, [el('span', { text: 'Familiers' }), el('span', { text: String(s.familles) })]),
          el('li', {}, [el('span', { text: 'Modifiée le' }), el('span', { text: new Date(s.modifieLe).toLocaleString('fr-FR') })]),
        ]));
        carte.append(el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-primary btn-sm', onClick: async () => { await this.jeu.charger(s.slot); toast(`Partie « ${s.nom} » chargée.`, 'good'); this.onAction('jeu'); } }, ['Charger']),
          el('button', { class: 'btn btn-sm', onClick: () => this._exporter(s.slot, s.nom) }, ['Exporter (JSON)']),
          el('button', { class: 'btn btn-sm', onClick: () => this._reinitialiser(s.slot, s.nom) }, ['Réinitialiser']),
          this.jeu.saves.existeSecours(s.slot)
            ? el('button', { class: 'btn btn-sm', onClick: () => this._restaurer(s.slot) }, ['Restaurer la copie de secours'])
            : null,
        ]));
      } else {
        carte.append(el('p', { class: 'muted', text: 'Emplacement libre.' }));
        carte.append(el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-primary btn-sm', onClick: () => this._creer(s.slot) }, ['Créer une partie']),
        ]));
      }
      zone.append(carte);
    }

    $('#btn-export-all').onclick = async () => {
      const resume = await this.jeu.resume();
      const donnees = { jeu: 'infinite-vrcraft', exporteLe: new Date().toISOString(), emplacements: resume.slots };
      this._telecharger('infinite-vrcraft-resume.json', JSON.stringify(donnees, null, 2));
      toast('Résumé exporté.', 'good');
    };

    $('#import-file').onchange = (e) => this._preparerImport(e.target.files?.[0]);
    $('#btn-import-cancel').onclick = () => {
      $('#import-file').value = '';
      $('#import-preview').hidden = true;
      $('#import-actions').hidden = true;
      $('#import-error').hidden = true;
    };
  }

  async _creer(slot) {
    const nom = await demanderTexte({ titre: `Nouvelle partie — Sauvegarde ${slot + 1}`, message: 'Choisissez un pseudonyme (aucun e-mail ni téléphone demandé).', valeur: 'Joueur', maxlength: 40, labelOk: 'Créer' });
    if (nom === null) return;
    await this.jeu.creer(slot, nom || 'Joueur', '🧪');
    toast('Partie créée avec Feu, Eau, Terre et Vent.', 'good');
    this.onAction('jeu');
  }

  async _reinitialiser(slot, nom) {
    const ok = await confirmer({
      titre: 'Réinitialiser la sauvegarde',
      message: `ATTENTION : la sauvegarde ${slot + 1} « ${nom} » sera supprimée. Une copie de secours locale est conservée. Continuer ?`,
      labelOk: 'Réinitialiser', danger: true,
    });
    if (!ok) return;
    await this.jeu.saves.reinitialiser(slot);
    toast('Sauvegarde réinitialisée. Copie de secours disponible.', 'warn');
    this.sauvegardes();
  }

  async _restaurer(slot) {
    const data = await this.jeu.saves.restaurerSecours(slot);
    if (!data) { toast('Aucune copie de secours valide.', 'bad'); return; }
    toast('Copie de secours restaurée.', 'good');
    this.sauvegardes();
  }

  async _exporter(slot, nom) {
    try {
      const texte = await this.jeu.saves.exporterTexte(slot);
      this._telecharger(`infinite-vrcraft-${String(nom).replace(/\W+/g, '-')}-save${slot + 1}.json`, texte);
      toast('Export terminé.', 'good');
    } catch (e) {
      toast(`Export impossible : ${e.message}`, 'bad');
    }
  }

  _telecharger(nomFichier, contenu) {
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nomFichier });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async _preparerImport(fichier) {
    const zoneErreur = $('#import-error');
    const preview = $('#import-preview');
    zoneErreur.hidden = true;
    if (!fichier) return;
    const texte = await fichier.text();
    const { validerTexteSauvegarde } = await import('../saves/validate.js');
    const res = validerTexteSauvegarde(texte);
    if (!res.ok) {
      zoneErreur.hidden = false;
      zoneErreur.textContent = `Import refusé : ${res.erreur}${res.details ? ` (${res.details})` : ''}`;
      preview.hidden = true;
      $('#import-actions').hidden = true;
      return;
    }
    const d = res.data;
    preview.hidden = false;
    preview.textContent = JSON.stringify({
      jeu: d.jeu, nom: d.nom, niveau: d.niveau, xp: d.xp,
      decouvertes: Object.keys(d.decouvertes || {}).length,
      historique: (d.historique || []).length,
      familiers: Object.keys(d.familiers || {}).length,
      modifieLe: d.modifieLe,
    }, null, 2);
    $('#import-actions').hidden = false;
    $('#btn-import-confirm').onclick = async () => {
      const slot = Number($('#import-slot').value);
      const r = await this.jeu.saves.importer(slot, texte);
      if (!r.ok) {
        zoneErreur.hidden = false;
        zoneErreur.textContent = `Import refusé : ${r.erreur}${r.details ? ` (${r.details})` : ''}`;
        return;
      }
      toast('Sauvegarde importée.', 'good');
      $('#btn-import-cancel').onclick();
      this.sauvegardes();
    };
  }

  /* ===================== PARAMETRES ===================== */

  parametres() {
    const zone = $('#settings-body');
    clear(zone);
    if (!this.save) return this._vide(zone);
    const p = this.save.parametres || (this.save.parametres = {});

    const ligne = (label, controle, aide) => el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
      el('div', {}, [el('b', { text: label }), aide ? el('div', { class: 'meta muted', text: aide }) : null]),
      controle,
    ]);

    const selTheme = el('select', { class: 'input' }, ['cosmos', 'foret', 'ocean', 'clair', 'contraste'].map((t) => el('option', { value: t, text: t })));
    selTheme.value = p.theme || 'cosmos';
    selTheme.onchange = () => { this.jeu.majParametres({ theme: selTheme.value }); this.onAction('parametres'); };

    const selLangue = el('select', { class: 'input' }, [
      el('option', { value: 'fr', text: 'Français' }),
      el('option', { value: 'en', text: 'English' }),
    ]);
    selLangue.value = p.langue || 'fr';
    selLangue.onchange = () => { this.jeu.majParametres({ langue: selLangue.value }); this.onAction('parametres'); };

    const chkSons = el('input', { type: 'checkbox' });
    chkSons.checked = Boolean(p.sons);
    chkSons.onchange = () => this.jeu.majParametres({ sons: chkSons.checked });

    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05' });
    vol.value = String(p.volume ?? 0.5);
    vol.oninput = () => this.jeu.majParametres({ volume: Number(vol.value) });

    const chkAnim = el('input', { type: 'checkbox' });
    chkAnim.checked = Boolean(p.animationsReduites);
    chkAnim.onchange = () => this.jeu.majParametres({ animationsReduites: chkAnim.checked });

    const taille = el('input', { type: 'range', min: '0.8', max: '1.4', step: '0.1' });
    taille.value = String(p.tailleElements ?? 1);
    taille.oninput = () => {
      document.documentElement.style.setProperty('font-size', `${15 * Number(taille.value)}px`);
      this.jeu.majParametres({ tailleElements: Number(taille.value) });
    };

    const selMode = el('select', { class: 'input' }, [
      el('option', { value: 'catalogue', text: 'Catalogue (recettes officielles uniquement)' }),
      el('option', { value: 'creativite', text: 'Créativité (propositions expérimentales + IA facultative)' }),
    ]);
    selMode.value = p.mode || 'catalogue';
    selMode.onchange = () => this.jeu.majParametres({ mode: selMode.value });

    const chkAuto = el('input', { type: 'checkbox' });
    chkAuto.checked = this.save.sauvegardeAuto !== false;
    chkAuto.onchange = () => { this.save.sauvegardeAuto = chkAuto.checked; this.jeu.sauvegarder(); };

    zone.append(
      ligne('Thème', selTheme),
      ligne('Langue', selLangue),
      ligne('Sons', chkSons, 'Sons générés localement, aucun fichier à télécharger.'),
      ligne('Volume', vol),
      ligne('Réduire les animations', chkAnim, 'Confort visuel et accessibilité.'),
      ligne('Taille du texte', taille),
      ligne('Mode de fusion', selMode, 'Le mode Catalogue ne compte que les recettes officielles validées.'),
      ligne('Sauvegarde automatique', chkAuto),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', onClick: () => { this.jeu.majParametres({ theme: 'cosmos' }); this.onAction('parametres'); } }, ['Réinitialiser les paramètres']),
        el('button', { class: 'btn', onClick: () => this.jeu.sauvegarder({ backup: true }).then(() => toast('Sauvegarde manuelle effectuée.', 'good')) }, ['Sauvegarder maintenant']),
      ]),
    );

    // Section IA
    const ia = $('#settings-ai');
    clear(ia);
    const cfg = this.jeu.configIA();
    const endpoint = el('input', { class: 'input', type: 'url', placeholder: 'https://votre-worker.example.workers.dev/fusion', value: cfg.endpoint || '' });
    const actif = el('input', { type: 'checkbox' });
    actif.checked = Boolean(cfg.actif);
    ia.append(
      el('p', { class: 'muted', text: 'Aucune clé d\'API n\'est stockée dans le jeu. Le navigateur appelle uniquement un point d\'entrée intermédiaire (Worker, fonction serveur) qui détient la clé côté serveur. Sans service, le mode expérimental local prend le relais.' }),
      ligne('Point d\'entrée du service IA', endpoint),
      ligne('Activer le service IA', actif),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary',
          onClick: () => {
            this.jeu.majConfigIA({ endpoint: endpoint.value.trim(), actif: actif.checked });
            toast('Configuration IA enregistrée (aucune clé n\'est conservée côté navigateur).', 'good');
          },
        }, ['Enregistrer']),
      ]),
    );
  }

  /* ===================== PROFIL ===================== */

  profil() {
    const zone = $('#profile-body');
    clear(zone);
    if (!this.save) return this._vide(zone);
    const st = this.jeu.statistiques();

    zone.append(el('div', { class: 'card' }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [
        el('h3', { text: `${this.save.avatar || '🧪'} ${this.save.nom}` }),
        el('button', { class: 'btn btn-sm', onClick: async () => {
          const nom = await demanderTexte({ titre: 'Modifier le pseudonyme', valeur: this.save.nom, maxlength: 40 });
          if (nom) { this.save.nom = nom; await this.jeu.sauvegarder(); this.profil(); this.majTopbar(); }
        } }, ['Modifier']),
      ]),
      el('p', { class: 'muted', text: `Titre : ${st.titre} · Niveau ${st.niveau}` }),
      el('div', { class: 'progress' }, [el('span', { style: { width: `${Math.round(st.ratio * 100)}%` } })]),
      el('p', { class: 'meta', text: `${st.xpDansNiveau} / ${st.xpRequis} XP avant le niveau suivant (total ${st.xp} XP)` }),
    ]));

    const stats = [
      ['Fusions tentées', st.fusionsTentees],
      ['Découvertes', `${st.decouvertes} / ${st.totalElements}`],
      ['Recettes officielles du catalogue', st.recettesOfficielles],
      ['Créations expérimentales', st.recettesExperimentales],
      ['Quêtes terminées', st.quetesTerminees],
      ['Mondes débloqués', st.mondesDebloques],
      ['Familiers possédés', st.familiers],
      ['Succès obtenus', st.succes],
      ['Aides utilisées', st.aidesUtilisees],
      ['Jours de jeu', st.joursDeJeu],
      ['Série de connexion', `${this.save.series?.jours || 1} jour(s)`],
    ];
    zone.append(el('div', { class: 'card' }, [
      el('h3', { text: 'Statistiques' }),
      el('ul', { class: 'kv' }, stats.map(([k, v]) => el('li', {}, [el('span', { text: k }), el('span', { text: String(v) })]))),
    ]));

    // Classements locaux (clairement séparés de tout classement en ligne)
    const classement = el('div', { class: 'grid grid-auto' });
    zone.append(el('div', { class: 'card' }, [
      el('h3', { text: 'Classement local des emplacements' }),
      el('p', { class: 'muted', text: 'Comparaison entre vos trois sauvegardes locales uniquement. Aucun classement en ligne n\'est simulé.' }),
      classement,
    ]));
    (async () => {
      const slots = (await this.jeu.saves.lister()).filter((s) => s.existe).sort((a, b) => b.niveau - a.niveau || b.decouvertes - a.decouvertes);
      if (!slots.length) { classement.append(el('p', { class: 'muted', text: 'Aucune sauvegarde.' })); return; }
      slots.forEach((s, i) => classement.append(el('div', { class: 'item' }, [
        el('span', { class: 'title', text: `#${i + 1} — ${s.nom}` }),
        el('span', { class: 'meta', text: `Niveau ${s.niveau} · ${s.decouvertes} découvertes` }),
      ])));
    })();
  }

  credits() { /* contenu statique dans index.html */ }

  /* ===================== TUTORIEL ===================== */

  tutoriel() {
    const etapes = [
      { t: 'Bienvenue', c: 'Vous démarrez avec exactement quatre éléments : Feu 🔥, Eau 💧, Terre 🌍 et Vent 💨.' },
      { t: 'Déplacer', c: 'Cliquez un élément dans la palette pour l\'ajouter au plateau. Glissez-le avec la souris ou le doigt pour l\'organiser.' },
      { t: 'Fusionner', c: 'Déposez un élément sur un autre pour fusionner, ou sélectionnez deux éléments et appuyez sur « Fusionner » (contrôle accessible).' },
      { t: 'Découvrir', c: 'Une nouvelle recette donne de l\'expérience. Le mode Créativité permet des propositions expérimentales, clairement signalées.' },
      { t: 'Progresser', c: 'Les quêtes, succès, mondes et collections donnent de l\'XP et des récompenses.' },
      { t: 'Aides', c: 'Vos familiers offrent 5 aides par tranche de 10 minutes, partagées entre tous les animaux. Une aide n\'est décomptée que si elle fournit un résultat utile.' },
      { t: 'Sauvegardes', c: 'Trois emplacements indépendants. Exportez en JSON, importez avec validation. Aucun compte ni e-mail nécessaire.' },
    ];
    let i = 0;
    const afficher = () => {
      const e = etapes[i];
      const contenu = el('div', {}, [
        el('p', { text: e.c }),
        el('p', { class: 'muted', text: `Étape ${i + 1} / ${etapes.length}` }),
      ]);
      const actions = [];
      if (i > 0) actions.push({ label: 'Précédent', action: () => { i--; afficher(); return false; } });
      if (i < etapes.length - 1) actions.push({ label: 'Suivant', variant: 'primary', action: () => { i++; afficher(); return false; } });
      else actions.push({ label: 'Terminer', variant: 'primary', action: () => { toast('Bon jeu !', 'good'); } });
      ouvrirModale({ titre: e.t, contenu, actions });
    };
    afficher();
  }

  _vide(zone) {
    clear(zone);
    zone.append(el('p', { class: 'muted', text: 'Chargez ou créez une partie depuis l\'écran Sauvegardes.' }));
  }

  _remplirSelect(sel, labelTous, valeurs) {
    const node = $(sel);
    if (!node) return;
    const actuel = node.value;
    clear(node);
    node.append(el('option', { value: '', text: labelTous }));
    for (const v of valeurs) node.append(el('option', { value: v, text: v }));
    node.value = valeurs.includes(actuel) ? actuel : '';
  }
}
