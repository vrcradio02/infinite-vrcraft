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
import { POINTS_PAR_AMI } from '../social/friends.js';
import { dateApercu, resumeProfil } from '../social/profil.js';

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
      case 'amis': return this.amis();
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
      ['📚 Catalogue officiel', `${resume.recettesOfficielles} recettes · ${resume.elements} éléments`],
      ['🎮 Partie en cours', this.save ? `${this.save.nom} — niveau ${this.save.niveau}` : 'Aucune partie chargée'],
      ['🗂️ Emplacements occupés', `${resume.slots.filter((s) => s.existe).length} / ${NB_SAUVEGARDES}`],
      ['🤖 Service IA', resume.iaDisponible ? 'Configuré (facultatif)' : 'Non configuré — mode expérimental local'],
      ['📴 Mode hors ligne', 'Disponible après le premier chargement'],
    ];
    for (const [k, v] of lignes) {
      liste.append(el('li', {}, [el('span', { text: k }), el('span', { text: v })]));
    }
    const sub = $('#home-continue-sub');
    const dernier = resume.slots.find((s) => s.slot === resume.dernier && s.existe) || resume.slots.find((s) => s.existe);
    sub.textContent = dernier ? `👤 ${dernier.nom} — niveau ${dernier.niveau} (emplacement ${dernier.slot + 1})` : '💤 Aucune sauvegarde';
    const boutonContinuer = $('[data-action="continuer"]');
    if (boutonContinuer) boutonContinuer.disabled = !dernier;
    this.majTopbar();
  }

  majTopbar() {
    const zone = $('#topbar-stats');
    clear(zone);
    if (!this.save) {
      zone.append(el('span', { text: '👤 Aucune partie' }));
      return;
    }
    const st = this.jeu.statistiques();
    zone.append(
      el('span', {}, [el('b', { text: this.save.nom })]),
      el('span', {}, ['🏅 Niv. ', el('b', { text: String(st.niveau) }), ` · ${st.titre}`]),
      el('span', {}, ['🔬 Découvertes ', el('b', { text: String(st.decouvertes) }), `/ ${st.totalElements}`]),
      el('span', {}, ['✨ XP ', el('b', { text: String(st.xp) })]),
      el('span', {}, ['👥 Amis ', el('b', { text: String(st.amis || 0) }), st.amisEnAttente ? ` (+${st.amisEnAttente} à valider)` : '']),
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

    this._remplirSelect($('#inv-cat'), '🏷️ Toutes les catégories', [...new Set([...this.jeu.store.elements.values()].map((e) => e.categorie))].sort());
    this._remplirSelect($('#inv-rare'), '💎 Toutes les raretés', RARETES);

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
      $('#inv-count').textContent = `📦 ${items.length} élément(s) affiché(s) sur ${Object.keys(this.save.decouvertes).length} découvert(s).`;
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
      title: `➕ ${meta.nom} — ${meta.categorie} / ${meta.rarete}. Cliquer pour ajouter au plateau.`,
      onClick: () => {
        this.plateau.ajouterElement(meta.id);
        this.onAction('jeu');
      },
    }, [
      el('span', { class: 'title' }, [
        el('span', { 'aria-hidden': 'true', text: meta.emoji || '✨' }),
        el('span', { text: meta.nom }),
      ]),
      el('span', { class: 'meta' }, [
        el('span', { class: 'badge', text: meta.rarete }), ' ', meta.categorie,
        meta.creation ? ' ' : null,
        meta.creation ? el('span', { class: 'badge badge-creation', text: '🧬 Création' }) : null,
      ]),
      el('span', { class: 'meta', text: meta.description || '' }),
    ]);
  }

  /* ===================== ENCYCLOPEDIE ===================== */

  encyclopedie() {
    const liste = $('#enc-list');
    clear(liste);
    if (!this.save) return this._vide(liste);

    this._remplirSelect($('#enc-cat'), '🏷️ Toutes les catégories', [...new Set([...this.jeu.store.elements.values()].map((e) => e.categorie))].sort());
    this._remplirSelect($('#enc-rare'), '💎 Toutes les raretés', RARETES);
    this._remplirSelect($('#enc-monde'), '🗺️ Tous les mondes', [...new Set([...this.jeu.store.elements.values()].map((e) => e.monde))].sort());

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
      $('#enc-count').textContent = `📖 ${items.length} élément(s) affiché(s). Collection : ${decouverts} / ${this.jeu.store.nombreElements} découverts.`;
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
        meta.creation ? el('span', { class: 'badge badge-creation', text: '🧬 Création' }) : null,
      ]),
      el('div', { class: 'meta', text: `🏷️ ${meta.categorie} · 🗺️ monde ${meta.monde}${meta.creation ? ' · 🧬 création enregistrée' : ''}` }),
      el('div', { class: 'meta', text: connu ? (meta.description || '') : '🔒 Élément non découvert.' }),
    ]);

    if (connu && recettes.length) {
      bloc.append(el('details', {}, [
        el('summary', { text: `📜 Recettes connues (${recettes.length})` }),
        el('div', { class: 'recipes-known' }, recettes.slice(0, 8).map((r) => el('span', { text: `${this.emoji(r.a)} ${this.nom(r.a)} + ${this.emoji(r.b)} ${this.nom(r.b)}` }))),
      ]));
    } else if (connu) {
      bloc.append(el('div', { class: 'meta', text: '🌱 Élément de départ ou recette secrète.' }));
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
      if (!entrees.length) { zone.append(el('p', { class: 'muted', text: '🕘 Aucune fusion enregistrée.' })); return; }
      for (const h of entrees) {
        zone.append(el('div', { class: 'item' }, [
          el('div', { class: 'title' }, [
            el('span', { text: `${this.emoji(h.a)} ${h.nomA}` }),
            el('span', { text: '+' }),
            el('span', { text: `${this.emoji(h.b)} ${h.nomB}` }),
            el('span', { text: '=' }),
            el('span', { text: h.resultat ? `${h.resultat}` : '∅' }),
          ]),
          el('div', { class: 'meta', text: `📅 ${new Date(h.date).toLocaleString('fr-FR')} · 🧪 mode ${h.mode} · 📌 statut ${h.statut}` }),
        ]));
      }
    };
    $('#hist-filter').onchange = rendre;
    $('#btn-hist-clear').onclick = async () => {
      if (!await confirmer({ titre: 'Effacer l\'historique', message: 'Cette action n\'efface PAS vos découvertes. Continuer ?', labelOk: 'Effacer', danger: true })) return;
      this.save.historique = [];
      await this.jeu.sauvegarder();
      rendre();
      toast('🧹 Historique effacé.', 'info');
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
      ['📅 Quêtes quotidiennes', q.quotidiennes, 'quotidiennes'],
      ['🗓️ Quêtes hebdomadaires', q.hebdomadaires, 'hebdomadaires'],
      ['📖 Aventures scénarisées', q.scenarisees, 'scenarisees'],
    ];

    for (const [titre, liste, scope] of sections) {
      zone.append(el('h3', { text: titre }));
      const conteneur = el('div', { class: 'grid grid-auto' });
      if (!liste?.length) conteneur.append(el('p', { class: 'muted', text: '💤 Rien pour le moment.' }));
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
        el('span', { class: 'meta', text: obtenu ? `📅 Obtenu le ${new Date(this.save.succes[s.id]).toLocaleDateString('fr-FR')}` : '🔒 Non obtenu' }),
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
      el('div', { class: 'meta', text: `${progression} / ${objectif} · récompense ${quete.recompense?.xp ?? 0} XP + 🧪 ${quete.recompense?.potions ?? 1} potion(s)` }),
    ]);
    if (scope === 'scenarisees') {
      const etape = quete.etapes?.[quete.etape];
      if (etape) carte.append(el('div', { class: 'meta', text: `🚩 Étape en cours : ${etape.nom} — ${etape.description}` }));
      if (quete.personnages?.length) {
        carte.append(el('div', { class: 'meta', text: `${quete.personnages[0].emoji} ${quete.personnages[0].nom} : « ${quete.personnages[0].replique} »` }));
      }
    }
    if (quete.terminee && !quete.reclamee) {
      carte.append(el('button', {
        class: 'btn btn-primary btn-sm',
        onClick: async () => {
          const r = this.jeu.reclamerQuete(scope, quete.id);
          if (r.ok) { toast(`Récompense : +${r.xp} XP et 🧪 +${r.potions} potion(s)`, 'good'); this.quetes(); this.majTopbar(); }
          else toast(r.erreur, 'warn');
          await this.jeu.sauvegarder();
        },
      }, ['🎁 Réclamer la récompense']));
    }
    if (quete.reclamee) carte.append(el('div', { class: 'meta good', text: '✅ Récompense obtenue' }));
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
        el('span', { class: 'meta', text: `🎨 Thèmes : ${(m.themes || []).join(', ')}` }),
        el('span', { class: 'meta', text: m.debloque ? '✅ Débloqué' : `🔒 Condition : ${descriptionCondition(m)}` }),
      ]);
      if (m.debloque) carte.append(el('div', { class: 'meta good', text: '▶️ Accessible' }));
      zone.append(carte);
    }

    zone.append(el('h3', { text: '🏆 Collections thématiques' }));
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
    const minuteur = el('div', { class: 'meta' });
    const rafraichirMinuteur = (e) => {
      if (e.bonus) {
        minuteur.textContent = `🧪 Bonus de potion actif : ${e.restant} aides. Le compteur revient à ${e.max} / ${e.max} à la prochaine recharge de 10 minutes.`;
      } else {
        minuteur.textContent = e.tempsRestant > 0 ? `⏳ Prochaine recharge dans ${formatDuree(e.tempsRestant)}` : '✅ Quota plein.';
      }
    };
    rafraichirMinuteur(etat);
    carte.append(el('div', {}, [
      el('div', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: '🧰' }), el('span', { text: `Aides : ${etat.restant} / ${etat.max}${etat.bonus ? ' 🧪' : ''}` })]),
      el('div', { class: 'meta', text: 'ℹ️ Quota commun à tous les familiers et à tous les types d\'aide (5 par 10 minutes).' }),
      minuteur,
      el('div', { class: 'meta good', text: `🧪 Potions de familier : ${etat.potions} — une potion donne +1 niveau à un animal ET recharge le quota d'aides (3/5 → 5/5, et 5/5 → 10/5).` }),
    ]));
    const pips = el('div', { class: 'quota-pips', 'aria-hidden': 'true' });
    const total = Math.max(etat.max, etat.restant);
    for (let i = 0; i < total; i++) {
      const classes = ['pip'];
      if (i < etat.restant) classes.push('on');
      if (i >= etat.max) classes.push('bonus');
      pips.append(el('span', { class: classes.join(' ') }));
    }
    carte.append(pips);
    clearInterval(this._timerQuota);
    this._timerQuota = setInterval(() => rafraichirMinuteur(this.jeu.etatQuota()), 1000);
  }

  /** Donne une potion à un familier : +1 niveau et quota d'aides rechargé. */
  _donnerPotion(familierId) {
    const r = this.jeu.donnerPotion(familierId);
    if (!r.ok) { toast(r.erreur, 'warn'); return; }
    toast(
      `${r.emoji} ${r.nom} passe au niveau ${r.niveau} · quota d'aides ${r.restant}/${r.max}${r.bonus ? ' (bonus de potion 🧪)' : ''} · potions restantes : ${r.potions}`,
      'good', 9000,
    );
    this.familiers();
    this.majTopbar();
  }

  _rendreActionsAide() {
    const zone = $('#help-actions');
    clear(zone);
    const equipe = this.save.equipe.filter((id) => this.save.familiers[id]);
    if (!equipe.length) {
      zone.append(el('p', { class: 'muted', text: '🐾 Équipez au moins un familier pour utiliser les aides.' }));
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
        el('span', { class: 'meta', text: `🎯 Spécialité : ${def.specialite}` }),
        el('span', { class: 'meta', text: def.description }),
        el('span', { class: 'meta', text: possede ? `⭐ Niveau ${niveau} · ${info.dansNiveau}/${info.requis} XP` : '🔒 Non possédé' }),
        el('span', { class: 'meta', text: competences.length ? `🌟 Compétences : ${competences.map((c) => c.nom).join(', ')}` : `🔓 Compétences à débloquer : ${(def.competences || []).map((c) => `${c.nom} (niv. ${c.niveauRequis})`).join(', ')}` }),
      ]);

      if (possede) {
        carte.append(el('div', { class: 'row' }, [
          etat.equipe
            ? el('button', { class: 'btn btn-sm', onClick: () => { this.jeu.retirerFamilier(def.id); this.familiers(); this.jeu.sauvegarder(); } }, ['➖ Retirer de l\'équipe'])
            : el('button', { class: 'btn btn-sm btn-primary', onClick: () => {
                const r = this.jeu.equiperFamilier(def.id);
                if (!r.ok) toast(r.erreur, 'warn'); else this.familiers();
                this.jeu.sauvegarder();
              } }, ['➕ Ajouter à l\'équipe']),
          el('button', {
            class: 'btn btn-sm',
            title: 'Une potion donne +1 niveau à ce familier et recharge le quota d\'aides.',
            disabled: (this.save.potions || 0) <= 0,
            onClick: () => this._donnerPotion(def.id),
          }, [`🧪 Donner une potion (${this.save.potions || 0})`]),
        ]));
      } else {
        carte.append(el('span', { class: 'meta', text: '🔓 Déblocage : progressez (découvertes, niveaux) pour l\'obtenir.' }));
      }
      zone.append(carte);
    }
  }

  _rendreEquipe() {
    const zone = $('#pets-team');
    clear(zone);
    const equipe = this.save.equipe || [];
    if (!equipe.length) zone.append(el('p', { class: 'muted', text: '🐾 Aucun familier équipé.' }));
    for (const id of equipe) {
      const def = this._petDef(id);
      const etat = this.save.familiers[id];
      if (!def || !etat) continue;
      zone.append(el('div', { class: 'item pet equipped' }, [
        el('div', { class: 'title' }, [el('span', { class: 'avatar', 'aria-hidden': 'true', text: def.emoji }), el('span', { text: def.nom })]),
        el('span', { class: 'meta', text: `⭐ Niveau ${etat.niveau} · 🎯 ${def.specialite}` }),
      ]));
    }
    zone.append(el('p', { class: 'muted', text: `🤝 Équipe active : ${equipe.length} / ${EQUIPE_MAX}.` }));
  }

  /* ===================== SAUVEGARDES ===================== */

  async sauvegardes() {
    const zone = $('#saves-body');
    clear(zone);
    const slots = await this.jeu.saves.lister();

    for (const s of slots) {
      const carte = el('div', { class: `card slot ${s.existe ? '' : 'empty'}` });
      carte.append(el('h3', { text: `💾 Sauvegarde ${s.slot + 1}` }));
      if (s.existe) {
        carte.append(el('ul', { class: 'kv' }, [
          el('li', {}, [el('span', { text: '👤 Pseudonyme' }), el('span', { text: s.nom })]),
          el('li', {}, [el('span', { text: '⭐ Niveau' }), el('span', { text: String(s.niveau) })]),
          el('li', {}, [el('span', { text: '🔬 Découvertes' }), el('span', { text: String(s.decouvertes) })]),
          el('li', {}, [el('span', { text: '🐾 Familiers' }), el('span', { text: String(s.familles) })]),
          el('li', {}, [el('span', { text: '📅 Modifiée le' }), el('span', { text: new Date(s.modifieLe).toLocaleString('fr-FR') })]),
        ]));
        carte.append(el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-primary btn-sm', onClick: async () => { await this.jeu.charger(s.slot); toast(`▶️ Partie « ${s.nom} » chargée.`, 'good'); this.onAction('jeu'); } }, ['▶️ Charger']),
          el('button', { class: 'btn btn-sm', onClick: () => this._exporter(s.slot, s.nom) }, ['⬇️ Exporter (JSON)']),
          el('button', { class: 'btn btn-sm', onClick: () => this._reinitialiser(s.slot, s.nom) }, ['♻️ Réinitialiser']),
          this.jeu.saves.existeSecours(s.slot)
            ? el('button', { class: 'btn btn-sm', onClick: () => this._restaurer(s.slot) }, ['🛟 Restaurer la copie de secours'])
            : null,
        ]));
      } else {
        carte.append(el('p', { class: 'muted', text: '➕ Emplacement libre.' }));
        carte.append(el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-primary btn-sm', onClick: () => this._creer(s.slot) }, ['✨ Créer une partie']),
        ]));
      }
      zone.append(carte);
    }

    $('#btn-export-all').onclick = async () => {
      const resume = await this.jeu.resume();
      const donnees = { jeu: 'infinite-vrcraft', exporteLe: new Date().toISOString(), emplacements: resume.slots };
      this._telecharger('infinite-vrcraft-resume.json', JSON.stringify(donnees, null, 2));
      toast('📤 Résumé exporté.', 'good');
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
    toast('✨ Partie créée avec Feu, Eau, Terre et Vent.', 'good');
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
    toast('♻️ Sauvegarde réinitialisée. Copie de secours disponible.', 'warn');
    this.sauvegardes();
  }

  async _restaurer(slot) {
    const data = await this.jeu.saves.restaurerSecours(slot);
    if (!data) { toast('🚫 Aucune copie de secours valide.', 'bad'); return; }
    toast('🛟 Copie de secours restaurée.', 'good');
    this.sauvegardes();
  }

  async _exporter(slot, nom) {
    try {
      const texte = await this.jeu.saves.exporterTexte(slot);
      this._telecharger(`infinite-vrcraft-${String(nom).replace(/\W+/g, '-')}-save${slot + 1}.json`, texte);
      toast('⬇️ Export terminé.', 'good');
    } catch (e) {
      toast(`⚠️ Export impossible : ${e.message}`, 'bad');
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
      toast('📥 Sauvegarde importée.', 'good');
      $('#btn-import-cancel').onclick();
      this.sauvegardes();
    };
  }

  /* ===================== AMIS ===================== */

  /**
   * Écran Amis : ajout par pseudonyme, demandes à valider, liste et code d'invitation.
   * Chaque ami accepté rapporte `POINTS_PAR_AMI` potions (une seule fois par personne).
   */
  amis() {
    const etat = this.jeu.etatAmis();
    const carte = $('#friends-card');
    clear(carte);

    // --- Bandeau d'état : identifiant public, relais, récompense ---
    carte.append(el('div', { class: 'title' }, [
      el('span', { 'aria-hidden': 'true', text: '🪪' }),
      el('span', { text: `Votre identifiant : ${etat.identifiant}` }),
    ]));
    carte.append(el('p', { class: 'muted', text: `Aucun compte, aucun e-mail : votre identifiant est dérivé de votre pseudonyme. Chaque ami accepté rapporte ${POINTS_PAR_AMI} potions 🧪 (une seule fois par ami).` }));
    carte.append(el('p', { class: 'muted', text: etat.relais
      ? '📡 Relais d’amis configuré : la notification part directement chez l’autre joueur.'
      : '🎟️ Aucun relais configuré : la demande est livrée par un code d’invitation à transmettre à votre ami (Paramètres → Relais d’amis pour l’envoi direct).' }));
    carte.append(el('p', { class: 'meta', text: `👥 ${etat.resume.total} ami(s) · 📨 ${etat.resume.recues} demande(s) à valider · ⏳ ${etat.resume.envoyees} envoyée(s) · 🧪 ${etat.resume.potionsGagnees} potions gagnées grâce aux amis.` }));

    // --- Formulaire : on tape le pseudonyme de l'ami ---
    const champ = el('input', { class: 'input', type: 'text', maxlength: 24, placeholder: '👤 Pseudonyme de votre ami', value: '' });
    const envoyer = el('button', { class: 'btn btn-primary' }, ['📨 Envoyer la demande d’ami']);
    envoyer.addEventListener('click', () => this._demanderAmi(champ.value));
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._demanderAmi(champ.value); });
    carte.append(el('div', { class: 'row' }, [champ, envoyer]));

    // --- Demandes reçues : la notification « voulez-vous l'ajouter dans vos amis ? » ---
    const inbox = $('#friends-inbox');
    clear(inbox);
    if (!etat.recues.length) inbox.append(el('p', { class: 'muted', text: '📭 Aucune demande en attente.' }));
    for (const d of etat.recues) {
      inbox.append(el('div', { class: 'item quest' }, [
        el('div', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: d.avatar || '🧪' }), el('span', { text: `${d.nom} veut vous ajouter dans vos amis` })]),
        el('span', { class: 'meta', text: `Reçue le ${new Date(d.date).toLocaleDateString('fr-FR')}` }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-sm btn-primary', onClick: () => this._accepterAmi(d.id) }, [`✅ Accepter (+${POINTS_PAR_AMI} 🧪)`]),
          el('button', { class: 'btn btn-sm', onClick: () => { this.jeu.refuserAmi(d.id); toast('Demande refusée.', 'warn'); this.amis(); this.majTopbar(); } }, ['❌ Refuser']),
        ]),
      ]));
    }

    // --- Demandes envoyées (annulables) ---
    const envoyees = $('#friends-sent');
    clear(envoyees);
    if (!etat.envoyees.length) envoyees.append(el('p', { class: 'muted', text: '✉️ Aucune demande envoyée en attente.' }));
    for (const d of etat.envoyees) {
      envoyees.append(el('div', { class: 'item' }, [
        el('div', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: '⏳' }), el('span', { text: d.nom })]),
        el('span', { class: 'meta', text: 'En attente d’acceptation.' }),
        el('button', { class: 'btn btn-sm', onClick: () => { this.jeu.annulerDemandeAmi(d.id); toast('Demande annulée.', 'info'); this.amis(); } }, ['✖️ Annuler']),
      ]));
    }

    // --- Liste d'amis : chacun avec son profil consultable ---
    const profils = this.jeu.profilsAmis();
    const mien = resumeProfil(this.jeu.monProfil());
    const liste = $('#friends-list');
    clear(liste);
    if (!etat.liste.length) liste.append(el('p', { class: 'muted', text: '🫂 Aucun ami pour le moment. Ajoutez-en un avec son pseudonyme.' }));
    if (etat.liste.length) {
      const tout = el('button', { class: 'btn btn-sm' }, ['🔄 Tout rafraîchir']);
      tout.addEventListener('click', () => this._rafraichirTous());
      liste.append(el('div', { class: 'row' }, [tout]));
    }
    for (const a of etat.liste) {
      const p = profils[a.id];
      const resume = p ? resumeProfil(p) : null;
      liste.append(el('div', { class: 'item' }, [
        el('div', { class: 'title' }, [el('span', { 'aria-hidden': 'true', text: a.avatar || '🧪' }), el('span', { text: a.nom })]),
        el('span', { class: 'meta', text: `Ami depuis le ${new Date(a.date).toLocaleDateString('fr-FR')} · +${POINTS_PAR_AMI} 🧪 déjà versées` }),
        el('span', { class: 'meta', text: resume
          ? `⭐ Niveau ${resume.niveau} · 📦 ${resume.objets} objets · 💎 ${resume.objetsRares} objets rares · 🐾 ${resume.animaux} animaux · 🔬 ${resume.decouvertes} découvertes`
          : '👀 Aucun aperçu de son profil pour le moment (relais ou code de profil).' }),
        el('span', { class: 'meta', text: resume
          ? `⚖️ Vous : 📦 ${mien.objets} objets · 🐾 ${mien.animaux} animaux · ⭐ Niveau ${mien.niveau} · aperçu du ${dateApercu(p.recuLe)}`
          : '🎟️ Demandez-lui son code de profil (ou activez le relais) pour recevoir son aperçu : niveau, objets, animaux et statistiques.' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-sm btn-primary', onClick: () => this.voirProfilAmi(a.id) }, ['👁️ Voir le profil']),
          el('button', { class: 'btn btn-sm', onClick: () => this._rafraichirProfil(a.id) }, ['🔄 Rafraîchir']),
          el('button', { class: 'btn btn-sm', onClick: () => { this.jeu.retirerAmi(a.id); toast(`${a.nom} retiré de vos amis.`, 'info'); this.amis(); this.majTopbar(); } }, ['✖️ Retirer']),
        ]),
      ]));
    }

    // --- Profils partagés : le mien + import du code d'un ami ---
    this._carteProfils();

    // --- Code d'invitation (mode sans relais) ---
    const zone = $('#friends-code');
    clear(zone);
    const champCode = el('input', { class: 'input', type: 'text', placeholder: '🎟️ Collez ici un code reçu', value: '' });
    const valider = el('button', { class: 'btn' }, ['✅ Ajouter depuis ce code']);
    valider.addEventListener('click', () => this._traiterCodeAmi(champCode.value));
    zone.append(
      el('p', { class: 'muted', text: 'Un code remplace le relais : envoyez-le à votre ami par le moyen de votre choix (message, réseau social…), il le colle ici et reçoit la notification.' }),
      el('div', { class: 'row' }, [champCode, valider]),
    );
  }

  /**
   * Carte « profils partagés » : mon aperçu, sa mise en ligne (relais) ou son code,
   * et l'import du profil d'un ami sans relais.
   */
  _carteProfils() {
    const zone = $('#friends-profil');
    clear(zone);
    if (!this.save) return;
    const mon = this.jeu.monProfil();
    const relais = this.jeu.etatAmis().relais;

    zone.append(el('p', { class: 'muted', text: 'Vos amis peuvent consulter un aperçu de votre partie (niveau, découvertes, familiers, statistiques). Ni votre sauvegarde ni vos recettes complètes ne quittent votre appareil.' }));
    if (mon) {
      zone.append(el('p', { class: 'meta', text: `🪪 ${mon.avatar} ${mon.nom} — ⭐ Niveau ${mon.progression.niveau} · 🔬 ${mon.decouvertes.total} découvertes · 🐾 ${mon.familiers.total} familiers · 🗺️ ${mon.mondes.total} mondes · 🧪 ${mon.stats.potions} potions` }));
    }

    const copier = el('button', { class: 'btn btn-sm' }, ['📋 Copier mon profil (code)']);
    copier.addEventListener('click', async () => {
      const r = this.jeu.codeProfil();
      if (!r.ok) { toast(r.erreur, 'warn'); return; }
      this._afficherCode('🪪 Mon profil de joueur', 'Envoyez ce code à un ami : il le colle dans « Profils partagés » et voit vos statistiques, vos découvertes et vos familiers.', r.code);
    });
    const publier = el('button', { class: 'btn btn-sm btn-primary' }, ['📡 Publier mon profil']);
    publier.addEventListener('click', async () => {
      publier.disabled = true;
      const r = await this.jeu.publierProfil();
      publier.disabled = false;
      toast(r.ok ? '📡 Profil publié : vos amis peuvent le consulter.' : `📡 ${r.erreur}`, r.ok ? 'good' : 'warn', 7000);
      this.amis();
    });
    const moi = el('button', { class: 'btn btn-sm' }, ['👁️ Voir mon profil partagé']);
    moi.addEventListener('click', () => this._ouvrirProfil(mon, { moi: true }));

    zone.append(el('div', { class: 'row' }, relais ? [publier, copier, moi] : [copier, moi]));
    if (!relais) zone.append(el('p', { class: 'muted', text: '📡 Sans relais configuré (Paramètres → Relais d’amis), le profil se transmet par code.' }));

    const champ = el('input', { class: 'input', type: 'text', placeholder: '🎟️ Collez ici le code de profil d’un ami', value: '' });
    const importer = el('button', { class: 'btn' }, ['✅ Voir ce profil']);
    importer.addEventListener('click', () => {
      const r = this.jeu.importerProfil(champ.value);
      if (!r.ok) { toast(r.erreur, 'warn'); return; }
      champ.value = '';
      toast(`🪪 Profil de ${r.profil.nom} enregistré.`, 'good', 7000);
      this.amis();
      this._ouvrirProfil(this.jeu.profilAmi(r.profil.id));
    });
    zone.append(el('div', { class: 'row' }, [champ, importer]));
  }

  /** Rafraîchit les aperçus de TOUS les amis en un seul appel au relais. */
  async _rafraichirTous() {
    const r = await this.jeu.synchroniserProfils({ publier: false });
    if (!r.ok) { toast(`📡 ${r.erreur}`, 'warn', 7000); return; }
    this.amis();
    toast(r.recus ? `🔄 ${r.recus} aperçu(s) d’ami mis à jour.` : '🔄 Aucun nouvel aperçu publié par vos amis.', r.recus ? 'good' : 'info', 6000);
  }

  /** Rafraîchit l'aperçu d'un ami par le relais (sans relais, on explique le code). */
  async _rafraichirProfil(id) {
    const r = await this.jeu.synchroniserProfils({ publier: false });
    if (!r.ok) { toast(`📡 ${r.erreur}`, 'warn', 7000); return; }
    this.amis();
    const p = this.jeu.profilAmi(id);
    toast(p ? `🔄 Aperçu de ${p.nom} mis à jour (${dateApercu(p.recuLe)}).` : 'Aucun profil publié par cet ami pour le moment.', p ? 'good' : 'info', 6000);
  }

  /** Ouvre la fiche de profil d'un ami (ou la mienne). */
  voirProfilAmi(id) {
    this._ouvrirProfil(this.jeu.profilAmi(id));
  }

  /** Compteurs lisibles d'un aperçu : objets, objets rares, animaux, mondes, succès… */
  _compteursProfil(profil) {
    const d = profil.decouvertes || {};
    const sur = (n, total) => (total ? `${n} / ${total}` : String(n));
    return [
      ['📦 Objets', sur(d.total || 0, d.catalogue || 0)],
      ['💎 Objets rares', String(d.totalRares || 0)],
      ['🧬 Créations', String(d.creations || 0)],
      ['🐾 Animaux', String(profil.familiers?.total || 0)],
      ['🗺️ Mondes', sur(profil.mondes?.total || 0, profil.mondes?.referentiel || 0)],
      ['🧩 Collections', sur(profil.collections?.completees || 0, profil.collections?.referentiel || 0)],
      ['🏅 Succès', sur(profil.succes?.total || 0, profil.succes?.referentiel || 0)],
    ];
  }

  /**
   * Comparaison « vous / votre ami » ligne par ligne (objets, objets rares, animaux, niveau…).
   * @returns {Array} lignes `<li>` prêtes à afficher
   */
  _comparerProfils(mien, sien) {
    if (!mien || !sien) return [];
    const lignes = [
      ['📦 Objets', mien.decouvertes?.total || 0, sien.decouvertes?.total || 0],
      ['💎 Objets rares', mien.decouvertes?.totalRares || 0, sien.decouvertes?.totalRares || 0],
      ['🐾 Animaux', mien.familiers?.total || 0, sien.familiers?.total || 0],
      ['⭐ Niveau', mien.progression?.niveau || 1, sien.progression?.niveau || 1],
      ['🗺️ Mondes', mien.mondes?.total || 0, sien.mondes?.total || 0],
      ['🧩 Collections', mien.collections?.completees || 0, sien.collections?.completees || 0],
      ['🏅 Succès', mien.succes?.total || 0, sien.succes?.total || 0],
    ];
    return lignes.map(([libelle, a, b]) => {
      const ecart = b - a;
      const signe = ecart === 0 ? '⚖️ égalité' : ecart > 0 ? `🔺 +${ecart}` : `🔻 ${ecart}`;
      return el('li', {}, [
        el('span', { text: libelle }),
        el('span', { text: `Vous ${a} · Lui ${b} (${signe})` }),
      ]);
    });
  }

  /**
   * Fiche détaillée d'un aperçu : progression, objets (et leurs raretés), animaux,
   * mondes, collections, succès, comparaison avec ma partie et statistiques.
   * Aucun contenu n'est injecté en HTML.
   */
  _ouvrirProfil(profil, { moi = false } = {}) {
    if (!profil) {
      ouvrirModale({
        titre: '🪪 Profil',
        contenu: el('div', {}, [
          el('p', { text: 'Aucun aperçu de ce joueur pour le moment.' }),
          el('p', { class: 'muted', text: 'Demandez-lui de publier son profil (📡) ou de vous envoyer son code de profil, puis utilisez « 🔄 Rafraîchir » ou collez le code dans « Profils partagés ».' }),
        ]),
      });
      return;
    }

    const d = profil.decouvertes || {};
    const fam = profil.familiers || {};
    const stats = profil.stats || {};
    const mien = moi ? null : this.jeu.monProfil();
    const contenu = el('div', {}, [
      el('div', { class: 'card' }, [
        el('h3', { text: `${profil.avatar || '🧪'} ${profil.nom}${moi ? ' (vous)' : ''}` }),
        el('p', { class: 'muted', text: `🪪 ${profil.id} · aperçu ${moi ? 'de votre partie' : `reçu le ${dateApercu(profil.recuLe)} (${profil.source === 'relais' ? 'relais' : 'code'})`}` }),
        el('p', { class: 'meta', text: `⭐ Niveau ${profil.progression.niveau} · ✨ ${profil.progression.xp} XP · 🧪 ${stats.potions || 0} potions` }),
        el('ul', { class: 'kv' }, this._compteursProfil(profil).map(([libelle, valeur]) => el('li', {}, [
          el('span', { text: libelle }),
          el('span', { text: valeur }),
        ]))),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: '🔬 Découvertes' }),
        el('ul', { class: 'kv' }, [
          el('li', {}, [el('span', { text: '🧪 Éléments trouvés' }), el('span', { text: d.catalogue ? `${d.total} / ${d.catalogue}` : String(d.total) })]),
          el('li', {}, [el('span', { text: '💎 Objets rares (Rare et plus)' }), el('span', { text: String(d.totalRares || 0) })]),
          el('li', {}, [el('span', { text: '🧬 Créations du joueur' }), el('span', { text: String(d.creations || 0) })]),
          ...Object.entries(d.parRarete || {}).filter(([, n]) => n > 0).map(([r, n]) => el('li', {}, [el('span', { text: `💠 ${r}` }), el('span', { text: String(n) })])),
        ]),
        el('p', { class: 'muted', text: '🔎 Ses plus beaux objets :' }),
        d.rares?.length
          ? el('ul', { class: 'kv' }, (d.rares || []).map((x) => el('li', {}, [
            el('span', { text: `${x.emoji} ${x.nom}` }),
            el('span', { text: `${x.rarete} · ${dateApercu(x.date)}` }),
          ])))
          : el('p', { class: 'muted', text: '💤 Aucun objet rare pour le moment.' }),
        d.dernieres?.length ? el('p', { class: 'muted', text: '🕒 Dernières découvertes :' }) : null,
        el('ul', { class: 'kv' }, (d.dernieres || []).map((x) => el('li', {}, [
          el('span', { text: `${x.emoji} ${x.nom}${x.source === 'creation' ? ' 🧬' : ''}` }),
          el('span', { text: `${x.rarete} · ${dateApercu(x.date)}` }),
        ]))),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: `🐾 Familiers (${fam.total || 0}) — ses animaux` }),
        el('p', { class: 'meta', text: fam.equipe?.length
          ? `🎽 Équipe active : ${fam.equipe.map((id) => { const f = (fam.liste || []).find((x) => x.id === id); return f ? `${f.emoji} ${f.nom}` : id; }).join(', ')}`
          : '💤 Aucun animal dans son équipe active.' }),
        fam.liste?.length
          ? el('ul', { class: 'kv' }, (fam.liste || []).map((f) => el('li', {}, [
            el('span', { text: `${f.emoji} ${f.nom}${f.equipe ? ' 🎽' : ''}` }),
            el('span', { text: `${f.rarete || 'Commun'} · Niveau ${f.niveau}` }),
          ])))
          : el('p', { class: 'muted', text: '💤 Aucun animal connu pour le moment.' }),
      ]),
      mien ? el('div', { class: 'card' }, [
        el('h3', { text: `⚖️ Vous et ${profil.nom}` }),
        el('ul', { class: 'kv' }, this._comparerProfils(mien, profil)),
      ]) : null,
      el('div', { class: 'card' }, [
        el('h3', { text: '🗺️ Progression' }),
        el('ul', { class: 'kv' }, [
          el('li', {}, [el('span', { text: '🗺️ Mondes débloqués' }), el('span', { text: `${profil.mondes.total}${profil.mondes.referentiel ? ` / ${profil.mondes.referentiel}` : ''}` })]),
          el('li', {}, [el('span', { text: '🧩 Collections terminées' }), el('span', { text: `${profil.collections.completees}${profil.collections.referentiel ? ` / ${profil.collections.referentiel}` : ''}` })]),
          el('li', {}, [el('span', { text: '🏅 Succès' }), el('span', { text: `${profil.succes.total}${profil.succes.referentiel ? ` / ${profil.succes.referentiel}` : ''}` })]),
        ]),
        el('ul', { class: 'kv' }, (profil.collections.liste || []).map((c) => el('li', {}, [
          el('span', { text: `${c.emoji} ${c.nom}` }),
          el('span', { text: c.complete ? '✅ terminée' : '⬜ en cours' }),
        ]))),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: '📊 Statistiques' }),
        el('ul', { class: 'kv' }, [
          el('li', {}, [el('span', { text: '📦 Objets trouvés' }), el('span', { text: String(d.total || 0) })]),
          el('li', {}, [el('span', { text: '🔮 Objets par jour de jeu' }), el('span', { text: (d.total / (stats.joursDeJeu || 1)).toFixed(1) })]),
          el('li', {}, [el('span', { text: '🧪 Fusions tentées' }), el('span', { text: String(stats.fusionsTentees || 0) })]),
          el('li', {}, [el('span', { text: '📜 Quêtes terminées' }), el('span', { text: String(stats.quetesTerminees || 0) })]),
          el('li', {}, [el('span', { text: '🧰 Aides utilisées' }), el('span', { text: String(stats.aidesUtilisees || 0) })]),
          el('li', {}, [el('span', { text: '📅 Jours de jeu' }), el('span', { text: String(stats.joursDeJeu || 1) })]),
          el('li', {}, [el('span', { text: '🔥 Série de connexion' }), el('span', { text: `${stats.serie || 1} jour(s)` })]),
          el('li', {}, [el('span', { text: '🧪 Potions' }), el('span', { text: String(stats.potions || 0) })]),
          el('li', {}, [el('span', { text: '👥 Amis' }), el('span', { text: String(stats.amis || 0) })]),
        ]),
      ]),
    ]);
    ouvrirModale({ titre: `🪪 Profil de ${profil.nom}`, contenu });
  }

  /** Demande l'ajout d'un ami par pseudonyme et affiche le code à transmettre. */
  async _demanderAmi(pseudo) {
    const r = await this.jeu.demanderAmi(pseudo);
    if (!r.ok) { toast(r.erreur, 'warn'); return; }
    this.amis();
    this.majTopbar();
    if (r.livre) {
      toast(`📨 Demande envoyée à ${r.demande.vers.nom}. Il/elle doit l’accepter pour devenir votre ami (+${POINTS_PAR_AMI} 🧪 chacun).`, 'good', 9000);
      return;
    }
    this._afficherCode(
      `🎟️ Code d’invitation pour ${r.demande.vers.nom}`,
      `Transmettez ce code à ${r.demande.vers.nom} : il/elle le colle dans l’écran Amis et pourra accepter votre demande.`,
      r.code,
    );
  }

  /** Accepte une demande reçue : amitié + potions, puis code de confirmation à renvoyer. */
  async _accepterAmi(id) {
    const r = await this.jeu.accepterAmi(id);
    if (!r.ok) { toast(r.erreur, 'warn'); return; }
    this.amis();
    this.majTopbar();
    toast(`🫂 ${r.ami.nom} est maintenant votre ami ! +${r.potions} potions 🧪 (total : ${r.potionsTotal}).`, 'good', 9000);
    // Avec un relais configuré et joignable, la confirmation part toute seule :
    // on n'ouvre une fenêtre de code que si l'envoi direct n'a pas eu lieu.
    if (r.code && !r.livre) {
      this._afficherCode(
        `✅ Amitié acceptée avec ${r.ami.nom}`,
        `Pour que ${r.ami.nom} reçoive ses ${POINTS_PAR_AMI} potions à son tour, renvoyez-lui ce code (inutile si un relais d’amis est configuré et joignable).`,
        r.code,
      );
    }
  }

  /** Ajoute un ami (ou confirme une amitié) depuis un code collé. */
  _traiterCodeAmi(texte) {
    const r = this.jeu.traiterCodeAmi(texte);
    if (!r.ok) { toast(r.erreur, 'warn'); return; }
    this.amis();
    this.majTopbar();
    // L'annonce d'une amitié confirmée vient de l'événement (une seule fois).
    if (!r.potions) toast(`👥 Demande de ${r.demande?.nom || 'ce joueur'} ajoutée : accepter ou refuser.`, 'good', 8000);
  }

  /** Modale de notification d'une demande d'ami : « voulez-vous l'ajouter ? ». */
  notifierDemandeAmi(demande) {
    ouvrirModale({
      titre: '👥 Demande d’ami',
      contenu: el('div', {}, [
        el('p', {}, [
          el('b', { text: `${demande.avatar || '🧪'} ${demande.nom}` }),
          el('span', { text: ' veut vous ajouter dans vos amis.' }),
        ]),
        el('p', { class: 'muted', text: `Voulez-vous l’ajouter dans vos amis ? Vous recevrez ${POINTS_PAR_AMI} potions 🧪 de familier.` }),
      ]),
      actions: [
        { label: '❌ Refuser', action: () => { this.jeu.refuserAmi(demande.id); toast('Demande refusée.', 'warn'); this.amis(); this.majTopbar(); return true; } },
        { label: '✅ Oui, ajouter', variant: 'primary', action: () => { this._accepterAmi(demande.id); return true; } },
      ],
    });
  }

  /** Affiche un code à copier (presse-papiers si possible, sinon champ à recopier). */
  _afficherCode(titre, explication, code) {
    const zone = el('div', {}, [
      el('p', { class: 'muted', text: explication }),
      el('pre', { class: 'code-preview', text: code }),
    ]);
    ouvrirModale({
      titre,
      contenu: zone,
      actions: [
        { label: '📋 Copier', action: () => { this._copier(code); return false; } },
        { label: 'Fermer' },
      ],
    });
  }

  async _copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      toast('📋 Code copié dans le presse-papiers.', 'good');
    } catch {
      toast('Sélectionnez le code affiché pour le copier.', 'warn');
    }
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

    const THEMES = [
      ['cosmos', '🌌 Cosmos'], ['foret', '🌲 Forêt'], ['ocean', '🌊 Océan'],
      ['clair', '☀️ Clair'], ['contraste', '🔳 Contraste élevé'],
    ];
    const selTheme = el('select', { class: 'input' }, THEMES.map(([valeur, texte]) => el('option', { value: valeur, text: texte })));
    selTheme.value = p.theme || 'cosmos';
    selTheme.onchange = () => { this.jeu.majParametres({ theme: selTheme.value }); this.onAction('parametres'); };

    const selLangue = el('select', { class: 'input' }, [
      el('option', { value: 'fr', text: '🇫🇷 Français' }),
      el('option', { value: 'en', text: '🇬🇧 English' }),
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
      el('option', { value: 'catalogue', text: '📚 Catalogue (recettes officielles uniquement)' }),
      el('option', { value: 'creativite', text: '🧬 Créativité (crée de nouveaux éléments officiels + IA facultative)' }),
    ]);
    selMode.value = p.mode || 'catalogue';
    selMode.onchange = () => this.jeu.majParametres({ mode: selMode.value });

    const chkAuto = el('input', { type: 'checkbox' });
    chkAuto.checked = this.save.sauvegardeAuto !== false;
    chkAuto.onchange = () => { this.save.sauvegardeAuto = chkAuto.checked; this.jeu.sauvegarder(); };

    zone.append(
      ligne('🎨 Thème', selTheme),
      ligne('🌍 Langue', selLangue),
      ligne('🔊 Sons', chkSons, 'Sons générés localement, aucun fichier à télécharger.'),
      ligne('🔉 Volume', vol),
      ligne('🎞️ Réduire les animations', chkAnim, 'Confort visuel et accessibilité.'),
      ligne('🔠 Taille du texte', taille),
      ligne('🧪 Mode de fusion', selMode, 'En Créativité, une paire inconnue crée un nouvel élément : il est enregistré comme officiel, ajouté à l\'inventaire et devient reproductible.'),
      ligne('💾 Sauvegarde automatique', chkAuto),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', onClick: () => { this.jeu.majParametres({ theme: 'cosmos' }); this.onAction('parametres'); } }, ['♻️ Réinitialiser les paramètres']),
        el('button', { class: 'btn', onClick: () => this.jeu.sauvegarder({ backup: true }).then(() => toast('💾 Sauvegarde manuelle effectuée.', 'good')) }, ['💾 Sauvegarder maintenant']),
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
      el('p', { class: 'muted', text: '🔐 Aucune clé d\'API n\'est stockée dans le jeu. Le navigateur appelle uniquement un point d\'entrée intermédiaire (Worker, fonction serveur) qui détient la clé côté serveur. Sans service, le mode expérimental local prend le relais.' }),
      ligne('🤖 Point d\'entrée du service IA', endpoint),
      ligne('✅ Activer le service IA', actif),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary',
          onClick: () => {
            this.jeu.majConfigIA({ endpoint: endpoint.value.trim(), actif: actif.checked });
            toast('🤖 Configuration IA enregistrée (aucune clé n\'est conservée côté navigateur).', 'good');
          },
        }, ['✅ Enregistrer']),
      ]),
    );

    // Section Relais d'amis (facultatif : sans lui, on échange des codes d'invitation)
    const amis = $('#settings-amis');
    clear(amis);
    const cfgAmis = this.jeu.configAmis();
    const endpointAmis = el('input', { class: 'input', type: 'url', placeholder: 'https://relais-amis.votre-compte.workers.dev', value: cfgAmis.endpoint || '' });
    const actifAmis = el('input', { type: 'checkbox' });
    actifAmis.checked = Boolean(cfgAmis.actif);
    amis.append(
      el('p', { class: 'muted', text: '🔐 Aucune clé d\'API ici non plus : le navigateur n\'envoie que des pseudonymes à une URL publique. Le relais (exemple fourni : server/worker-amis.js) transporte les demandes d\'amis et les acceptations. Sans relais, tout fonctionne par codes d\'invitation à coller.' }),
      ligne('📡 URL du relais d\'amis', endpointAmis),
      ligne('✅ Activer le relais', actifAmis),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary',
          onClick: () => {
            this.jeu.majConfigAmis({ endpoint: endpointAmis.value.trim(), actif: actifAmis.checked });
            toast('📡 Configuration du relais d\'amis enregistrée.', 'good');
            this.onAction('amis');
          },
        }, ['✅ Enregistrer']),
        el('button', {
          class: 'btn',
          onClick: async () => {
            const r = await this.jeu.synchroniserAmis();
            toast(r.ok ? '📡 Relais interrogé.' : `📡 ${r.erreur}`, r.ok ? 'good' : 'warn');
            this.onAction('amis');
          },
        }, ['🔄 Tester maintenant']),
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
        } }, ['✏️ Modifier']),
      ]),
      el('p', { class: 'muted', text: `🏅 Titre : ${st.titre} · Niveau ${st.niveau}` }),
      el('div', { class: 'progress' }, [el('span', { style: { width: `${Math.round(st.ratio * 100)}%` } })]),
      el('p', { class: 'meta', text: `✨ ${st.xpDansNiveau} / ${st.xpRequis} XP avant le niveau suivant (total ${st.xp} XP)` }),
    ]));

    const stats = [
      ['🧪 Fusions tentées', st.fusionsTentees],
      ['🔬 Découvertes', `${st.decouvertes} / ${st.totalElements}`],
      ['📚 Recettes officielles du catalogue', st.recettesOfficielles],
      ['🧬 Créations enregistrées (officielles)', st.creations],
      ['🧪 Potions de familier', st.potions],
      ['📜 Quêtes terminées', st.quetesTerminees],
      ['🗺️ Mondes débloqués', st.mondesDebloques],
      ['🐾 Familiers possédés', st.familiers],
      ['🏅 Succès obtenus', st.succes],
      ['🧰 Aides utilisées', st.aidesUtilisees],
      ['📅 Jours de jeu', st.joursDeJeu],
      ['🔥 Série de connexion', `${this.save.series?.jours || 1} jour(s)`],
    ];
    zone.append(el('div', { class: 'card' }, [
      el('h3', { text: '📊 Statistiques' }),
      el('ul', { class: 'kv' }, stats.map(([k, v]) => el('li', {}, [el('span', { text: k }), el('span', { text: String(v) })]))),
    ]));

    // Classements locaux (clairement séparés de tout classement en ligne)
    const classement = el('div', { class: 'grid grid-auto' });
    zone.append(el('div', { class: 'card' }, [
      el('h3', { text: '🏆 Classement local des emplacements' }),
      el('p', { class: 'muted', text: 'Comparaison entre vos trois sauvegardes locales uniquement. Aucun classement en ligne n\'est simulé.' }),
      classement,
    ]));
    (async () => {
      const slots = (await this.jeu.saves.lister()).filter((s) => s.existe).sort((a, b) => b.niveau - a.niveau || b.decouvertes - a.decouvertes);
      if (!slots.length) { classement.append(el('p', { class: 'muted', text: 'Aucune sauvegarde.' })); return; }
      slots.forEach((s, i) => classement.append(el('div', { class: 'item' }, [
        el('span', { class: 'title', text: `#${i + 1} — ${s.nom}` }),
        el('span', { class: 'meta', text: `⭐ Niveau ${s.niveau} · 🔬 ${s.decouvertes} découvertes` }),
      ])));
    })();
  }

  credits() { /* contenu statique dans index.html */ }

  /* ===================== TUTORIEL ===================== */

  tutoriel() {
    const etapes = [
      { t: '👋 Bienvenue', c: 'Vous démarrez avec exactement quatre éléments : Feu 🔥, Eau 💧, Terre 🌍 et Vent 💨.' },
      { t: '🖐️ Déplacer', c: 'Cliquez un élément dans la palette pour l\'ajouter au plateau. Glissez-le avec la souris ou le doigt pour l\'organiser.' },
      { t: '⚗️ Fusionner', c: 'Déposez un élément sur un autre pour fusionner, ou sélectionnez deux éléments et appuyez sur « Fusionner » (contrôle accessible).' },
      { t: '🔬 Découvrir', c: 'Une nouvelle recette donne de l\'expérience. En mode Créativité, une paire inconnue crée un élément : il est enregistré comme officiel, ajouté à l\'inventaire et réutilisable comme ingrédient (aucune question posée).' },
      { t: '🚀 Progresser', c: 'Les quêtes, succès, mondes et collections donnent de l\'XP et des récompenses.' },
      { t: '🧰 Aides', c: 'Vos familiers offrent 5 aides par tranche de 10 minutes, partagées entre tous les animaux. Une aide n\'est décomptée que si elle fournit un résultat utile.' },
      { t: '🧪 Potions', c: 'Vous gagnez des potions en montant de niveau et en réclamant des quêtes. Donnez-en une à un animal depuis l\'écran Familiers : il gagne exactement un niveau et votre quota d\'aides est rechargé (3/5 → 5/5, et 5/5 → 10/5).' },
      { t: '💾 Sauvegardes', c: 'Trois emplacements indépendants. Exportez en JSON, importez avec validation. Aucun compte ni e-mail nécessaire.' },
    ];
    let i = 0;
    const afficher = () => {
      const e = etapes[i];
      const contenu = el('div', {}, [
        el('p', { text: e.c }),
        el('p', { class: 'muted', text: `📍 Étape ${i + 1} / ${etapes.length}` }),
      ]);
      const actions = [];
      if (i > 0) actions.push({ label: '⬅️ Précédent', action: () => { i--; afficher(); return false; } });
      if (i < etapes.length - 1) actions.push({ label: '➡️ Suivant', variant: 'primary', action: () => { i++; afficher(); return false; } });
      else actions.push({ label: '🎉 Terminer', variant: 'primary', action: () => { toast('🎉 Bon jeu !', 'good'); } });
      ouvrirModale({ titre: e.t, contenu, actions });
    };
    afficher();
  }

  _vide(zone) {
    clear(zone);
    zone.append(el('p', { class: 'muted', text: '📂 Chargez ou créez une partie depuis l\'écran Sauvegardes.' }));
  }

  /**
   * Remplit une liste déroulante déjà résolue (on passe l'ÉLÉMENT, pas un sélecteur :
   * `$(élément)` lèverait « is not a valid selector » dans un vrai navigateur).
   */
  _remplirSelect(node, labelTous, valeurs) {
    if (!node) return;
    const actuel = node.value;
    clear(node);
    node.append(el('option', { value: '', text: labelTous }));
    for (const v of valeurs) node.append(el('option', { value: v, text: v }));
    node.value = valeurs.includes(actuel) ? actuel : '';
  }
}
