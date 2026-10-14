# Infinite Craft Ultimate

Jeu de fusion d'éléments original, jouable dans le navigateur, **sans compte, sans e-mail et sans numéro de téléphone**.
Il démarre avec exactement **Feu 🔥, Eau 💧, Terre 🌍 et Vent 💨**, puis grandit par fusions, quêtes, mondes,
collections, familiers et **amis** (on tape le pseudonyme, l'autre reçoit la notification
« voulez-vous l'ajouter dans vos amis ? », et chaque ami accepté rapporte **10 potions**).

- Jeu publié : <https://vrcradio02.github.io/infinite-vrcraft/>
- Version locale : gratuite, aucune installation de serveur.
- Hébergement statique : **GitHub Pages** (aucun build nécessaire pour publier).
- Fonctionne **hors ligne** après le premier chargement (service worker).
- Aucune clé d'API n'est présente dans le code du navigateur.

> Nom provisoire, logo, couleurs et thèmes sont volontairement faciles à changer :
> `src/config.js`, `assets/logo.svg`, `src/styles/main.css`.

---

## 1. Démarrage rapide

Le projet n'a **aucune dépendance** : Node n'est utilisé que pour lancer un serveur statique
et les outils de développement.

```bash
git clone https://github.com/vrcradio02/infinite-vrcraft.git
cd infinite-vrcraft

# Lancer le jeu en local (serveur statique sans dépendance)
npm start            # => http://localhost:5173
# ou, sans npm :
node tools/serve.mjs 5173
```

Ouvrez ensuite <http://localhost:5173>.

> Un serveur est nécessaire (plutôt qu'ouvrir `index.html` depuis le disque) car le jeu charge
> ses données via `fetch` et enregistre un service worker : les navigateurs bloquent ces
> opérations en `file://`.

### Installer les dépendances ?

Aucune n'est requise pour jouer ni pour publier. Il n'y a volontairement pas de `package-lock.json` :
le projet reste sans dépendance.

---

## 2. Commandes disponibles

| Commande | Rôle |
|---|---|
| `npm start` | Sert le jeu en local (`tools/serve.mjs`). |
| `npm test` | Tests automatisés (unitaires + intégration). |
| `npm run build` | Recompile `data/registre-fusions.json` depuis les lots (déterministe). |
| `npm run validate` | Valide le registre (doublons, ingrédients, accessibilité). |
| `npm run generate -- --count 500` | Génère un **lot candidat** de recettes (jamais officiel d'office). |
| `npm run check:modules` | Vérifie que tous les modules et imports se chargent. |
| `npm run check:selectors` | Vérifie que chaque `#id` utilisé existe dans `index.html`. |
| `npm run check:smoke` | Exécute le vrai `main.js` sous un DOM simulé. |
| `npm run check` | Enchaîne toutes les vérifications ci-dessus + la validation du registre. |
| `node tools/serveur-relais.mjs 8787` | Lance le **relais d'amis local** (pour tester les amis à deux navigateurs, sans rien déployer). |

Ordre recommandé pour toute modification de données :

```bash
npm run build && npm run validate && npm test && npm run check
```

Le registre officiel est **versionné** : après une modification des recettes, relancez `npm run build`
puis committez `data/registre-fusions.json`. La compilation est **déterministe** (aucun horodatage),
donc sans changement de données elle ne produit aucun diff.

---

## 3. Arborescence

```
infinite-vrcraft/
├── index.html                     Page unique (tous les écrans)
├── manifest.webmanifest           Manifeste PWA
├── sw.js                          Service worker (mode hors ligne)
├── assets/logo.svg                Logo provisoire (remplaçable)
├── src/
│   ├── main.js                    Amorçage : contrôleur + interface + événements
│   ├── config.js                  Nom, couleurs, quotas, courbe d'XP, raretés
│   ├── core/
│   │   ├── dom.js                 Utilitaires DOM (sans innerHTML dynamique)
│   │   ├── events.js              Bus d'événements
│   │   └── random.js              PRNG déterministe (hash, tirage, mélange)
│   ├── fusion/
│   │   ├── engine.js              Moteur de fusion (officiel + expérimental)
│   │   ├── store.js               Magasin de recettes indexé, chargement progressif
│   │   ├── registry-format.js     Codec du registre compact
│   │   └── normalize.js           Identifiants et clés de paire
│   ├── game/
│   │   ├── game.js                Contrôleur principal (le cœur du jeu)
│   │   ├── progression.js         XP, niveaux, titres, récompenses
│   │   ├── mondes.js              Déblocage des mondes
│   │   ├── collections.js         Collections thématiques
│   │   └── audio.js               Sons générés (aucun fichier audio)
│   ├── quests/
│   │   ├── quests.js              Quêtes quotidiennes / hebdomadaires / scénarisées
│   │   └── achievements.js        Succès
│   ├── pets/
│   │   ├── pets.js                Familiers : niveaux, compétences
│   │   └── help.js                Quota commun 5/10 min + les 5 types d'aide
│   ├── saves/
│   │   ├── saves.js               3 emplacements, export/import, copies de secours
│   │   ├── storage.js             IndexedDB + repli localStorage
│   │   └── validate.js            Validation stricte des imports
│   ├── ai/
│   │   ├── ai.js                  IA facultative (point d'entrée sans clé)
│   │   └── validate-proposal.js   Validation des propositions de l'IA
│   ├── social/
│   │   ├── friends.js             Amis : identifiant, demandes, +10 potions (logique pure)
│   │   └── relay.js               Relais d'amis facultatif (transport HTTP, sans clé)
│   ├── ui/
│   │   ├── shell.js               Toasts, modales, navigation, raccourcis
│   │   ├── board.js               Plateau : glisser-déposer, zoom, pan, palette
│   │   └── views.js               Tous les écrans
│   ├── i18n/index.js              Traductions (français par défaut, anglais inclus)
│   └── styles/main.css            Thèmes et mise en page responsive
├── data/
│   ├── elements.json              Catalogue d'éléments (format compact commenté)
│   ├── registre-fusions.json      Registre officiel VERSIONNÉ (42 Ko, généré par npm run build)
│   ├── fusions/index.json         Liste des lots chargés par le jeu
│   ├── fusions/lot-*.json         Recettes par monde (8 lots) — la source à éditer
│   ├── pets.json                  10 familiers
│   ├── quests.json                Quêtes et scénarios
│   ├── mondes.json                8 mondes + conditions de déblocage
│   └── collections.json           8 collections thématiques
├── server/worker-exemple.js       Proxy IA sécurisé (exemple, facultatif)
├── server/worker-amis.js          Relais d'amis sécurisé (Cloudflare Worker + KV, facultatif)
├── tools/
│   ├── serve.mjs                  Serveur statique
│   ├── serveur-relais.mjs         Relais d'amis local (même contrat que le Worker, pour tester)
│   ├── build-registry.mjs         Compile les lots → registre (déterministe, minifié)
│   ├── validate-registry.mjs      Valide le registre
│   ├── generate-recipes.mjs       Générateur de lots candidats
│   ├── check-modules.mjs          Vérifie les imports
│   ├── check-selectors.mjs        Vérifie HTML ⇄ JS
│   └── smoke-dom.mjs              Exécute main.js sous un DOM simulé
└── tests/                         Tests unitaires + intégration
```

---

## 4. Comment le jeu fonctionne

### 4.1 Moteur de fusion

- L'ordre des ingrédients **n'a pas d'importance** par défaut : `Feu + Eau` et `Eau + Feu` désignent
  la même recette (décision explicite, réglable via `ORDRE_IMPORTANT_PAR_DEFAUT`). Une recette peut
  forcer `ordered: true` pour documenter une exception.
- Recherche en O(1) grâce à un index `clé de paire → recette`.
- Cinq statuts possibles : `nouveau`, `connu`, `experimental`, `creation`, `inconnu`.
  (`creation` = paire inconnue composée en mode Créativité, immédiatement enregistrée comme
  élément officiel de la partie ; `experimental` ne subsiste que pour les anciennes parties.)
- **Chargement progressif** : le registre est chargé au démarrage, et des lots supplémentaires
  peuvent être chargés à la demande (`RecipeStore.chargerLot()`), ce qui permet de garder un
  démarrage rapide même avec un catalogue très volumineux.
- **Deux voies de chargement équivalentes** : le registre compilé, sinon directement les sources
  versionnées (`data/elements.json` + `data/fusions/index.json` + `data/fusions/lot-*.json`).
  Un test d'intégration vérifie que les deux voies produisent **exactement le même catalogue**.

### 4.2 Deux modes

| Mode | Comportement |
|---|---|
| **Catalogue** | Seules les recettes officielles validées comptent comme découvertes. |
| **Créativité** | Une paire sans recette produit une **création** (composeur local déterministe, ou service IA facultatif s'il est configuré). **Aucune fenêtre ne s'ouvre et aucune question n'est posée** : la création est enregistrée comme **élément officiel de la partie**, elle rejoint l'inventaire et l'encyclopédie comme **première découverte**, et devient **reproductible** (la même paire redonne toujours le même élément) et utilisable comme ingrédient. Elle est distinguée du catalogue livré par un badge 🧬 et le compteur « Créations enregistrées ». |

Détails utiles :

- Une création est **persistée dans la sauvegarde** (export/import compris) et rechargée à l'ouverture
  de la partie : un élément inventé hier reste fusionnable aujourd'hui.
- Les joueurs qui avaient des **créations expérimentales** d'une version précédente les voient
  **officialisées automatiquement** au chargement (recomposition déterministe).
- Le mode Catalogue reste strict : une paire inconnue n'y produit rien, et le jeu se contente d'un
  message discret (aucune fenêtre bloquante) rappelant que la Créativité existe.
- **Inventaire sans doublon** : le **nom** est l'identité d'une création. Si un élément porte déjà ce
  nom (accents, casse et espaces ignorés), la nouvelle paire est enregistrée comme **raccourci** vers
  cet élément au lieu de créer une deuxième entrée « Argile Ancien » ; le jeu l'annonce
  (« ♻️ … existe déjà ») et l'inventaire reste propre. Les paires deviennent donc interchangeables
  (`Argile + Temps` et `Argile + Vieux` donnent le même élément si le composeur produit le même nom).
  Les parties enregistrées avec des doublons (versions précédentes) sont **nettoyées au chargement** :
  les recettes sont repointées, les découvertes fusionnées et le compteur corrigé.

### 4.3 Familiers et aides

- **10 familiers** : Flammichou, Aquabulle, Terrapousse, Ventolino, Pixelou, Lumifée, Dragoforge,
  Nebulapin, RoboChat, Glitchou.
- Équipe active limitée à **3 familiers**.
- **Quota commun : 5 aides par fenêtre de 10 minutes**, partagé par **tous** les familiers et
  **tous** les types d'aide (ce n'est pas 5 aides par animal). Changer de familier ne réinitialise rien.
- Une aide n'est **décomptée que si elle fournit un résultat utile**. Si aucun indice n'est disponible,
  le message s'affiche mais le compteur reste intact.
- Les 5 types d'aide : indice de fusion, suggestion de recette, aide de quête, indice d'exploration,
  analyse de fusion.
- Le quota est persisté dans la sauvegarde **et** dans un miroir local : recharger la page ne
  redonne pas 5 aides.

#### Potions de familier

- On gagne des potions en **montant de niveau** (1 par niveau) et en **réclamant une quête** (1 par quête).
- Bouton **« 🧪 Donner une potion »** sur chaque familier possédé (écran Familiers) :
  - le familier monte d'**exactement un niveau** ;
  - le **quota d'aides est intégralement rechargé** : `0/5`, `1/5`, `2/5`, `3/5` ou `4/5` → **5/5** ;
  - si le quota était **déjà plein** (`5/5`), la potion offre un **bonus : 10/5** ;
  - dans tous les cas, la recharge de 10 minutes ramène ensuite le compteur à **5/5**.
- Le bonus de potion survit à un rechargement de page (il est persisté avec le quota).

### 4.4 Amis (aucun compte : un pseudonyme suffit)

On ajoute un ami **en tapant son pseudonyme**, et l'autre joueur reçoit la notification
« **X veut vous ajouter dans vos amis** » à laquelle il répond par oui ou non.

- **Aucun compte, aucun e-mail** : un joueur est identifié par son pseudonyme, transformé en
  identifiant stable et lisible (`l'identifiant de « Alex » est alex-1ijkml`), affiché sur l'écran Amis.
- **+10 potions par ami accepté**, versées **aux deux joueurs** : celui qui accepte les reçoit
  immédiatement, l'autre les reçoit quand la confirmation lui parvient.
- La récompense n'est versée **qu'une seule fois par personne** : retirer puis rajouter le même
  ami ne redonne pas 10 potions (une liste `cadeaux` garde la trace).
- Les potions sont les mêmes que celles des familiers : elles font **monter un familier d'un niveau**
  et **rechargent son quota d'aides** (voir §4.3). Ajouter un ami rapporte donc aussi des
  potions de familier.
- Une demande **refusée** ne revient pas ; la même personne pourra en renvoyer une **plus tard**.
- Bornes de sécurité : 200 amis, 50 demandes en attente, 24 caractères de pseudonyme.

Deux façons de faire arriver la notification chez l'autre joueur :

| Mode | Comment ça marche | Quand l'utiliser |
|---|---|---|
| **Relais d'amis** (facultatif) | Un petit relais HTTP transporte la demande, puis la confirmation. On colle son adresse dans **Paramètres → Relais d'amis** et on coche « activer le relais ». Exemple prêt à déployer : `server/worker-amis.js` (Cloudflare Worker + KV, gratuit) ; pour tester sans rien déployer : `node tools/serveur-relais.mjs`. | Deux joueurs en ligne, notification immédiate. |
| **Code d'invitation** (toujours disponible) | Sans relais, le jeu produit un **code court** (`ICU-AMI1:…`) à transmettre soi-même (message, réseau social…). L'ami le colle dans l'écran Amis : la demande apparaît et il peut accepter. Le code de confirmation renvoyé credite les 10 potions de l'autre côté. | Aucun serveur, aucun réglage. |

Règles de sécurité, identiques à celles du service IA : **aucune clé d'API dans le navigateur**, aucun mot
passe, aucune adresse e-mail, aucune partie de jeu ne quitte l'appareil — seuls un pseudonyme, un
identifiant dérivé de ce pseudonyme et un horodatage circulent. Les reçus d'amis vivent dans le
stockage du navigateur (IndexedDB, repli `localStorage`) et sont **exportés/importés avec la partie**,
validés par liste blanche.

#### Profils partagés (voir les stats, découvertes et animaux d'un ami)

Chaque ami de la liste affiche **👁️ Voir le profil** : niveau et XP, **découvertes** (total,
répartition par rareté, dernières trouvailles), **animaux** (nom, niveau, équipe active), mondes,
collections, succès et **statistiques** (fusions, quêtes, aides, jours de jeu, série, potions).

- **Partage** : bouton **📡 Publier mon profil** (relais configuré, rafraîchissement automatique toutes
  les 15 s) ou **📋 Copier mon profil (code)**, que l'ami colle dans « Profils partagés ».
- **Ce qui est partagé** : un aperçu **réduit et borné** (≤ 4 Ko) — jamais la carte des découvertes,
  l'historique des fusions, les recettes, les paramètres ni la sauvegarde.
- **Ce qui est refusé** : tout profil reçu est revalidé (liste blanche, valeurs bornées, taille), et un
  **identifiant annoncé n'est jamais cru** : il est recalculé depuis le pseudonyme, côté jeu comme
  côté relais (`server/worker-amis.js`). Personne ne peut donc écrire dans la boîte — ou écraser le
  profil publié — de quelqu'un d'autre en recopiant son identifiant.

---

### 4.5 Sauvegardes

- **Exactement 3 emplacements indépendants** (`Sauvegarde 1`, `Sauvegarde 2`, `Sauvegarde 3`).
- Écriture dans **IndexedDB**, avec repli automatique sur `localStorage` si IndexedDB est indisponible.
- **Export** JSON par emplacement, **import** avec prévisualisation et validation stricte.
- **Copie de secours** automatique avant tout écrasement et bouton de restauration.
- Les fichiers importés sont **lus, jamais exécutés** ; seuls des champs d'une liste blanche sont conservés.

---

## 5. Publier sur GitHub Pages

Le dépôt **est** le site : aucun build n'est nécessaire pour publier.

1. Poussez le dépôt sur GitHub (branche `main`).
2. Sur GitHub : **Settings → Pages**.
3. *Source* : **Deploy from a branch**.
4. *Branch* : **main**, dossier **/ (root)**. Enregistrez.
5. Attendez une minute : le jeu est publié sur
   `https://vrcradio02.github.io/infinite-vrcraft/`.

Notes importantes :

- Le fichier `.nojekyll` est présent : il empêche Jekyll d'ignorer certains fichiers.
- Tous les chemins sont **relatifs** (`./`), ce qui fonctionne dans un sous-dossier de projet.
- Le service worker exige **HTTPS** : GitHub Pages le fournit automatiquement.
- **À chaque publication qui modifie la coquille** (HTML, CSS, JS) : incrémentez `VERSION` dans
  `sw.js` **et** `GAME.version` dans `src/config.js`. Sans cela, les visiteurs déjà venus peuvent
  rester bloqués sur l'ancienne version mise en cache par le service worker.
- `data/registre-fusions.json` est **versionné** (registre officiel compilé, minifié pour le
  téléchargement). Après une modification des recettes : `npm run build`, puis committez le fichier.
  La compilation est déterministe. Si le fichier est absent, le jeu charge directement les sources
  versionnées (`data/elements.json` + `data/fusions/index.json` + lots) — les deux voies donnent
  le même catalogue, ce qu'un test d'intégration vérifie.

### Vérification automatique (facultative)

`.github/workflows/verifier.yml` exécute `npm run build`, `npm run check` et `npm test` à chaque
poussée et sur chaque demande de fusion. **Ce workflow ne publie rien** : la publication reste
faite par la branche `main`, ce qui évite qu'une panne de CI empêche la mise à jour du jeu.

### Publier en local pour vérifier

```bash
npm start
# puis ouvrez http://localhost:5173
```

---

## 6. Configurer un service IA (facultatif)

Par défaut, **aucune IA n'est nécessaire** : le mode Créativité utilise un composeur local
déterministe.

Si vous voulez brancher une IA :

1. Déployez `server/worker-exemple.js` (Cloudflare Worker, Deno Deploy, fonction serverless…).
2. Stockez la clé **côté serveur** :
   ```bash
   wrangler secret put AI_API_KEY
   ```
   Ne mettez **jamais** de clé dans ce dépôt, dans `localStorage`, ni dans le code du navigateur.
3. Dans le jeu : **Paramètres → Service IA facultatif**, collez l'URL du point d'entrée et cochez
   « Activer le service IA ».
4. Le jeu valide chaque proposition (ingrédients conformes, résultat non vide, limites de taille)
   et l'étiquette comme **création** : elle rejoint l'inventaire de la partie, exactement comme
   une création locale (le service IA n'est qu'une source de noms en plus).

Contrat attendu du proxy :

```
POST { "a": "feu", "b": "eau", "nomA": "Feu", "nomB": "Eau" }
→ 200 { "resultat": { "nom": "Vapeur", "categorie": "Météo", "rarete": "Commun", "description": "..." } }
```

---

## 7. Ajouter du contenu

### Ajouter une recette officielle

1. Choisissez le bon lot dans `data/fusions/lot-*.json`.
2. Ajoutez une entrée `[ingredientA, ingredientB, resultat]` (ordre indifférent).
3. Si le résultat n'existe pas encore, ajoutez-le dans `data/elements.json` au format
   `"identifiant": [nom, categorie, rarete, monde, emoji, description]`.
4. Recompilez et validez :
   ```bash
   npm run build && npm run validate && npm test
   ```

La catégorie et la rareté d'une recette sont **toujours** dérivées de l'élément résultat :
impossible de créer une incohérence en recopiant à la main.

### Générer des recettes en lot

```bash
npm run generate -- --count 2000 --seed mon-seed
```

Le générateur écrit `data/elements-genere.json` et `data/fusions/lot-genere.json` avec le statut
**`candidat`**. Ces recettes sont compilées dans le registre mais **comptées séparément** des
officielles : la promotion en officiel reste une décision humaine (relisez, puis passez le lot en
`"statut": "officiel"`).

---

## 8. Fonctionnalités réellement terminées

- [x] Moteur de fusion déterministe, recherche indexée, ordre des ingrédients non significatif
- [x] **Feu, Eau, Terre et Vent** comme uniques éléments de départ (vérifié par test)
- [x] Mode **Catalogue** et mode **Créativité** (résultats expérimentaux clairement distingués)
- [x] Composeur expérimental **local déterministe** (fonctionne hors ligne, sans IA)
- [x] Plateau avec **glisser-déposer** souris et tactile, zoom, panoramique, recentrage, nettoyage
- [x] **Contrôle alternatif accessible** : sélection de deux éléments + bouton « Fusionner »
- [x] Annuler / rétablir sur le plateau (avec pile dédiée, sans toucher aux découvertes)
- [x] Inventaire (recherche, tri, filtres catégorie/rareté)
- [x] Encyclopédie (recherche par nom, description, recette ; filtres catégorie, rareté, monde, date, statut)
- [x] Historique des fusions (filtrable, borné, effaçable sans perte de découvertes)
- [x] 8 raretés, animées différemment, sans blocage artificiel de la progression
- [x] XP, niveaux à courbe progressive, écran de montée de niveau, 8 titres
- [x] Quêtes **quotidiennes** (renouvelées chaque jour) et **hebdomadaires**
- [x] **3 aventures scénarisées** avec personnages, dialogues et étapes conditionnelles
- [x] 12 succès permanents
- [x] 8 mondes avec conditions de déblocage et 8 collections thématiques
- [x] Série de connexion **facultative, non punitive**
- [x] **3 emplacements de sauvegarde indépendants** (création, chargement, chargement auto)
- [x] Export JSON par emplacement, import avec prévisualisation et validation stricte
- [x] Copies de secours + restauration, réinitialisation avec confirmation explicite
- [x] Sauvegarde automatique (avec état affiché) et écriture IndexedDB + repli localStorage
- [x] **10 familiers** avec rareté, description, animation, compétences et progression
- [x] Équipe limitée à **3 familiers**, choix sauvegardé par emplacement
- [x] **Quota partagé de 5 aides / 10 minutes**, persistant après rechargement de page
- [x] **Potions de familier** : gagnées par niveau et par quête, elles font monter un animal d'un
      niveau **et** rechargent le quota (`3/5 → 5/5`, et `5/5 → 10/5`)
- [x] Les **5 types d'aide** demandés, non décomptés en cas d'échec
- [x] **Créations enregistrées comme éléments officiels** de la partie (inventaire, encyclopédie,
      recettes reproductibles, persistance, migration des anciennes créations expérimentales)
- [x] **Fusion fluide** : aucune fenêtre ne s'ouvre pour une paire inconnue (message discret)
- [x] Propositions IA **validées** et distinctes des recettes officielles
- [x] IA facultative **sans clé dans le navigateur** (proxy fourni en exemple)
- [x] Thèmes (5, dont un thème à contraste élevé), taille du texte, réduction des animations
- [x] Sons facultatifs générés localement + réglage du volume
- [x] Navigation clavier, libellés ARIA, indicateurs non fondés sur la seule couleur
- [x] Responsive ordinateur / tablette / téléphone (panneau latéral repliable)
- [x] Mode hors ligne via service worker
- [x] Internationalisation prête (français par défaut, anglais inclus)
- [x] Statistiques complètes, partage de découverte (copie dans le presse-papiers)
- [x] Classements **locaux** entre les 3 emplacements (aucun faux classement en ligne)
- [x] Registre officiel **versionné** (42 Ko), compilation déterministe
- [x] **Système d'amis sans compte** : on tape le pseudonyme de l'autre joueur, il reçoit la
      notification « voulez-vous l'ajouter dans vos amis ? », et **chaque ami accepté rapporte
      10 potions** (aux deux joueurs), une seule fois par personne
- [x] **Profil partagé entre amis** : chacun peut consulter le niveau, les découvertes (et leur
      rareté), les **familiers**, les mondes, les collections, les succès et les statistiques de
      ses amis — par le relais ou par un code de profil, jamais la sauvegarde
- [x] Amis livrés par **code d'invitation** (aucun serveur) ou par **relais facultatif**
      (`server/worker-amis.js`, exemple Cloudflare Worker + KV fourni)
- [x] **Inventaire sans doublon** : deux paires qui produisent le même nom donnent un seul
      élément (les parties déjà enregistrées sont nettoyées au chargement)
- [x] Outils : compilateur, validateur, générateur de lots, vérificateur d'imports, test de fumée,
      relais d'amis local
- [x] **188 tests automatisés** (unitaires + intégration du vrai contrôleur + fumée DOM)

## 9. Fonctionnalités restant à faire

Ces éléments du cahier des charges ne sont **pas** terminés. Ils sont listés honnêtement :

- [ ] **Catalogue dépassant 800 000 recettes.** Le registre contient aujourd'hui
      **266 recettes officielles** (voir §10). L'architecture est prête (lots, chargement
      progressif, générateur), mais l'objectif de volume n'est **pas atteint** et n'est pas
      revendiqué. Le générateur peut produire des milliers de candidats, mais ils restent
      « candidats » tant qu'une relecture humaine ne les valide pas.
- [ ] **Événements saisonniers** thématiques (structure de monde prévue, pas de calendrier d'événements).
- [ ] **Défis spéciaux** (contraintes du type « sans indice ») : non implémentés.
- [ ] **Boss créatifs** : non implémentés.
- [ ] **Traductions autres que français/anglais** : l'anglais n'est que partiellement traduit.
- [ ] **Synchronisation de sauvegarde côté serveur** : architecture prévue (`server/`), aucun backend
      livré (volontairement : le jeu doit rester jouable gratuitement sans serveur). Les **amis**
      font exception et disposent d'un relais **facultatif** livré en exemple (`server/worker-amis.js`) :
      il ne transporte que des pseudonymes et des demandes d'amis, jamais de partie.
- [ ] **Communauté en ligne** (recettes partagées, classements réels) : non implémentée et
      volontairement non simulée. Le relais d'amis existe, mais il n'y a **aucun serveur de jeu**
      ni annuaire de joueurs : on se transmet un pseudonyme ou un code d'invitation.
- [ ] **Accessoires cosmétiques pour familiers** : les récompenses de niveau sont générées mais
      l'écran de personnalisation cosmétique n'existe pas.
- [ ] **Tests dans un vrai navigateur** (clics, tactile, connexion lente) : voir §11.

---

## 10. Nombre réel de recettes et méthode de calcul

**266 recettes officielles** et **260 éléments**, mesurés par les outils du dépôt :

```bash
npm run build && npm run validate
```

```
Éléments : 260
Recettes officielles : 266
Recettes candidates : 0
Éléments atteignables : 260 / 260
Registre valide.
```

Méthode de calcul :

1. `tools/build-registry.mjs` lit **toutes** les entrées de `data/fusions/lot-*.json` et
   `data/elements.json`.
2. Il **rejette** les entrées incomplètes, les ingrédients inconnus et les résultats inconnus
   (`tools/rapport-registre.json` liste chaque rejet).
3. Il **déduplique par paire canonique** : une paire `(A, B)` ne peut avoir qu'une seule recette.
   Les doublons sont comptés séparément, jamais additionnés au total.
4. Il écrit `data/registre-fusions.json` (versionné, minifié, sans horodatage) avec un identifiant
   stable par recette.
5. Le compteur affiché par le jeu est exactement le nombre de recettes réellement indexées après
   rejet et déduplication (registre compilé, ou index reconstruit depuis les sources :
   un test d'intégration vérifie que **les deux voies produisent le même catalogue**).
6. Un test (`tests/data.test.mjs`) vérifie que **chaque élément du catalogue est atteignable**
   depuis les quatre éléments de départ : aucune recette orpheline ne gonfle le compteur.

**Aucun chiffre n'est gonflé artificiellement.** Les recettes « candidates » produites par le
générateur sont comptées dans un compteur **distinct** et ne sont jamais présentées comme officielles.

Répartition réelle du catalogue (mesurée) :

- 260 éléments, 266 recettes officielles, 0 candidate ;
- 8 lots : base (97), nature (18), technologie (30), culture (34), espace (23), fantastique (27), cuisine (28), tendances (9) ;
- 8 raretés : Commun 55, Peu commun 57, Rare 79, Épique 46, Légendaire 11, Mythique 7, Cosmique 4, Secret 1 ;
- 8 mondes : libre 30, nature 75, technologie 33, culture 32, espace 23, tendances 10, fantastique 28, cuisine 29.

---

## 11. Résultats des tests

```bash
npm test
```

```
ℹ tests 188
ℹ pass 188
ℹ fail 0
ℹ duration_ms ~2100
```

Couverture fonctionnelle réelle (extrait) :

| Domaine | Ce qui est vérifié |
|---|---|
| Moteur | symétrie des paires, statuts, déterminisme expérimental, doublons ignorés, ingrédient inconnu |
| Données | 4 éléments de départ exacts, identifiants uniques, catégorie/rareté cohérentes, **260/260 éléments atteignables** |
| Sauvegardes | format, version trop récente, types, limites, liste blanche des champs, export enveloppé |
| Familiers | courbe d'XP, équipe de 3 max, **quota 5/10 min partagé**, persistance après rechargement, aide non consommée sans résultat, **recharge par potion (`0→5/5` et `5/5→10/5`, retour à 5/5 après 10 min)** |
| Quêtes | déterminisme du tirage quotidien/hebdomadaire, progression par type, succès, mondes, collections |
| IA | proposition conforme acceptée, ingrédients incohérents refusés, résultat vide refusé |
| Amis | identifiant stable et distinct par pseudonyme, codes d'invitation aller-retour (accents compris), demande à soi-même refusée, demande en double ignorée, **+10 potions une seule fois** (retirer/rajouter un ami ne redonne rien), refus sans blocage d'une demande plus récente, normalisation/liste blanche, relais absent ou en panne sans plantage |
| Relais d'amis | **le Worker fourni livre une demande au destinataire et une réponse à celui qui avait demandé** (jamais l'inverse), livraison unique, entrées invalides refusées sans rien stocker, erreur explicite sans stockage KV, **identifiant recalculé depuis le pseudonyme** (impossible d'écrire dans la boîte d'un autre) |
| Profils | contenu exact de l'aperçu (progression, découvertes par rareté + dernières, familiers, mondes, collections, succès, statistiques), **rien de la partie n'est publié** (historique, paramètres, recettes), bornes et troncature, refus des profils sans pseudonyme, identifiant annoncé ignoré, codes aller-retour, profils d'amis dans la sauvegarde (normalisés, exportés) |
| Anti-doublon | **deux paires différentes donnant le même nom = un seul élément d'inventaire** (la seconde devient un raccourci), migration d'une partie enregistrée avec des créations homonymes (recettes repointées, découvertes fusionnées, catalogue nettoyé) |
| Intégration | vrai contrôleur : création de partie, fusion, chaîne Vapeur→Nuage, XP, aides, quota, export/import, 3 emplacements indépendants, **repli sans registre compilé**, **créations officielles (première découverte, reproductibilité, enchaînement, rechargement, export/import, migration des anciennes sauvegardes)**, **potions (niveau exact, quota, refus sans potion)** |
| Interface (habillage) | règle globale `[hidden]`, masquage de l'écran de chargement, rendu de chaque écran au changement d'onglet, liste déroulante recevant un élément (pas un sélecteur), emoji présents dans la navigation, les titres, les filtres et les écrans |
| Mise à jour du site | service worker à cache **versionné**, navigations servies « réseau d'abord », purge des anciens caches, coquille pré-cachée ne référençant que des fichiers existants, actions de secours de l'écran de chargement, rechargement unique (sans boucle) après une mise à jour |

Vérifications complémentaires :

```bash
npm run check
```

```
Modules importés avec succès : 29/29
HTML et JavaScript sont cohérents.
Bootstrap navigateur exécuté sans erreur (DOM simulé).
Écrans rendus : 11 vérifiés non vides.
Registre valide.
```

### Vérifications dans un vrai navigateur (Chrome headless)

Ces points ont été contrôlés automatiquement dans **Chrome 155 headless**, piloté par le protocole
DevTools (36 vérifications, toutes OK) :

- cause du blocage du chargement reproduite (`display: grid` sur `.boot` annulait l'attribut `hidden`),
  puis corrigée (`getComputedStyle(#boot).display === 'none'`, `#boot` ne couvre plus l'écran,
  le clic au centre atteint le contenu) ;
- création d'une partie depuis l'interface, sélection accessible de deux éléments, fusion
  **Eau + Feu = Vapeur** (4 → 5 découvertes) et affichage de l'élément sur le plateau ;
- les 10 écrans se rendent réellement (contenu non vide) et affichent des emoji ;
- aucune erreur console.

### Parcours « amis » vérifié à deux joueurs (Chrome headless + relais local)

`verif-amis.mjs` ouvre **deux navigateurs isolés** (Alice et Bruno, stockages séparés) sur le jeu
servi localement, avec le relais `tools/serveur-relais.mjs`. Les **26 vérifications passent** :

- le relais se configure depuis **Paramètres → Relais d'amis** (l'écran Amis le confirme) ;
- Alice **tape le pseudonyme « Bruno »** et clique « Envoyer la demande d'ami » : la demande part
  par le relais (toast « Demande envoyée à Bruno ») ;
- Bruno reçoit la **modale de notification** « Bruno… veut vous ajouter dans vos amis. Voulez-vous
  l'ajouter dans vos amis ? Vous recevrez 10 potions » avec les boutons **Refuser** et **Oui, ajouter** ;
- après acceptation, Bruno passe de **1 à 11 potions**, l'ami apparaît dans sa liste affichée, la
  notification se referme et la demande est soldée ;
- Alice **reçoit ses 10 potions à son tour** (11 au total) et voit Bruno dans sa liste ;
- une **seconde demande du même ami est refusée** (« Vous êtes déjà amis. ») et ne rapporte rien de plus ;
- Alice **publie son profil** et Bruno le récupère : sa fiche (ouverte par le vrai bouton
  « 👁️ Voir le profil ») affiche **niveau, découvertes, familiers et statistiques** ;
- sans relais, le **profil d'un ami s'importe par un code** (source « code ») et s'affiche aussi ;
- sans relais, un **code d'invitation collé** fait bien apparaître la demande à valider ;
- aucune erreur JavaScript dans les deux navigateurs.

Le même parcours est couvert en intégration (vrai contrôleur, deux parties simulées) par
`tests/integration.test.mjs`, et le routage du Worker par `tests/friends.test.mjs`.

### Parcours « visiteur bloqué » vérifié de bout en bout

Le scénario exact signalé par les joueurs a été reproduit puis validé (12 vérifications, toutes OK) :

1. le navigateur charge **l'ancienne version publiée** : son service worker met la coquille en
   cache (`icu-v1`) et l'écran “ Chargement du catalogue… ” reste affiché, le jeu est inaccessible ;
2. le site est corrigé et republié (mêmes adresses, fichiers différents) et la page est rechargée :
   le service worker détecte le nouveau `sw.js`, installe le cache `icu-v3` et supprime `icu-v1` ;
3. au plus tard au **deuxième rechargement**, la nouvelle version s'affiche (vérifiée : version
   `1.0.1`, `#boot` masqué, catalogue chargé, 12 boutons et 13 titres avec emoji, jeu jouable).

### Tests manuels (restent à faire sur un vrai appareil)

- [ ] glisser-déposer à la souris et au doigt, y compris sur petit écran ;
- [ ] zoom / panoramique au trackpad et au pincement ;
- [ ] navigation complète au clavier (Tab, Entrée, flèches, Échap) ;
- [ ] coupure réseau puis rechargement (mode hors ligne et cache du service worker) ;
- [ ] connexion très lente (3G simulée) ;
- [ ] couleur/contraste avec le thème « contraste » ;
- [ ] installation de l'application (PWA) sur mobile ;
- [ ] comportement en navigation privée (repli localStorage, absence d'IndexedDB) ;
- [ ] rendu des emoji : le conteneur de vérification n'a **aucune police emoji**, la lisibilité
      graphique des pictogrammes doit être confirmée sur un appareil réel.

---

## 12. Corrections apportées après la première mise en ligne

| Symptôme | Cause | Correction |
|---|---|---|
| L'écran « Chargement du catalogue… » ne disparaissait jamais : impossible de jouer | `.boot` et `.app` déclarent `display: grid` ; une règle d'auteur l'emporte sur le `display: none` que le navigateur applique à `[hidden]`, donc l'écran de chargement restait affiché par-dessus le jeu | règle globale `[hidden] { display: none !important; }` + masquage explicite (`hidden` **et** `display: none`) dans `afficherApplication()` |
| **Le blocage continuait pour certains joueurs, même après correction et republication** | Le service worker servait **toute** la coquille « cache d'abord » avec un nom de cache figé (`icu-v1`) : `index.html` et `src/main.js` bogués étaient resservis indéfiniment depuis le cache du navigateur, et comme `sw.js` lui-même n'avait pas changé, aucune mise à jour n'était détectée | `sw.js` réécrit : cache **versionné** (`icu-${VERSION}`, purge des anciens caches à l'activation), **réseau d'abord** pour les navigations et documents HTML, « cache puis rafraîchissement » pour les ressources, pré-cache fichier par fichier ; `main.js` recharge une seule fois la page quand une nouvelle version prend la main (`controllerchange`) |
| Attente sans fin si le chargement échoue ou traîne | `demarrer()` affichait un message d'erreur mais laissait l'écran de chargement, sans aucun moyen d'agir | surveillance du chargement (20 s) + boutons **🔄 Recharger** et **🧹 Vider le cache et recharger** (désinscription du service worker + purge des caches) affichés en cas d'échec, et numéro de version visible (`v1.0.1`) sur l'écran de chargement comme dans les crédits |
| Onglets Inventaire / Encyclopédie vides, voire plantage | `_remplirSelect()` recevait l'élément **et** le passait à `querySelector`, ce qui lève `is not a valid selector` dans un vrai navigateur (invisible sous le DOM simulé) | la fonction reçoit désormais directement l'élément ; le DOM simulé refuse maintenant un sélecteur non textuel |
| Aucun écran ne s'affichait après navigation | `vues.rendre(nom)` n'était jamais appelé : seul `majTopbar()` l'était | `onEcran()` appelle `vues.rendre(nom)` sur chaque changement d'écran |
| Interface austère | — | emoji ajoutés dans la navigation, les titres, les boutons, les filtres, les listes déroulantes, les cartes, les toasts et les modales |

### Version 1.1.0 — créations officielles et potions de familier

| Demande | Ce qui a été fait |
|---|---|
| **Les trouvailles du mode Créativité doivent s'enregistrer comme des éléments officiels et aller dans l'inventaire** | Le moteur renvoie une création (`STATUT.EXPERIMENTAL` + `creation: true`) ; `Jeu.enregistrerCreation()` l'inscrit au catalogue de la partie, crée une **recette reproductible** pour la paire, l'ajoute à `decouvertes` (inventaire + encyclopédie, badge **🧬 Création**) et la persiste dans `save.creations`. Une création sert ensuite d'**ingrédient** aux fusions suivantes. |
| **Fonctionnement plus fluide, sans question quand il ne connaît pas** | La fenêtre bloquante « 🚫 Pas de recette connue » a été **supprimée**. En mode Catalogue, une paire inconnue affiche un simple message discret ; en mode Créativité, elle produit directement la création (une annonce courte remplace la fenêtre de découverte). |
| **Marquer la première découverte** | La création reçoit une entrée de découverte `source: 'creation'`, `premiere: true`, avec la même XP qu'une recette officielle (selon la rareté) ; elle alimente quêtes, succès, mondes et collections. |
| **Des potions à donner à un animal pour le faire monter de niveau et réinitialiser son aide (`1/5`…`4/5` → `5/5`, et `5/5` → `10/5`)** | `QuotaAides.rechargerComplet()` : quota entamé → **5/5** ; quota déjà plein → **bonus 10/5**, remis à **5/5** par la recharge de 10 minutes. Les potions se gagnent **par niveau** et **par quête**, et le bouton **« 🧪 Donner une potion »** (écran Familiers) donne **exactement +1 niveau** au familier choisi. |

Détails techniques : les créations et les potions ont leurs propres champs de sauvegarde (`creations`, `potions`),
validés et bornés par la liste blanche (`LIMITES.maxCreations`, `LIMITES.maxPotions`), donc **exportées et importées**
avec la partie. Les anciennes sauvegardes qui n'avaient que des créations « expérimentales » (non officielles) sont
**migrées automatiquement** au chargement : elles réapparaissent dans l'inventaire et redeviennent fusionnables.

La version est incrémentée en `1.1.0` (`package.json`, `GAME.version`) et le cache du service worker en `v4`,
condition pour que les visiteurs déjà venus reçoivent réellement cette mise à jour.

### Version 1.4.0 — fiche d'ami détaillée et anti-doublon vérifié en jeu

| Demande | Ce qui a été fait |
|---|---|
| **« Rajoute des options pour les amis : voir combien il a d'objets, ses statistiques, ses découvertes, ses animaux… »** | La fiche d'un ami s'ouvre en **un clic** (bouton **👁️ Voir le profil**) et commence par des **compteurs explicites** : 📦 **objets** (et le total du catalogue), 💎 **objets rares**, 🧬 **créations**, 🐾 **animaux**, 🗺️ mondes, 🧩 collections, 🏅 succès. |
| **Voir ses plus beaux objets, pas seulement les derniers** | Chaque aperçu publie désormais la **liste des objets rares** (Rare et au-delà, les plus rares d'abord, bornée à 8) avec leur rareté et leur date de découverte, en plus de la répartition par rareté et des 12 dernières trouvailles. |
| **Ses animaux** | La section **🐾 Familiers — ses animaux** affiche le **nombre total**, l'**équipe active** (🎽, résolue en noms et emoji) et la liste des animaux triée du **plus haut niveau au plus bas**, avec **rareté** et niveau. |
| **Voir ses statistiques et se comparer** | La section **📊 Statistiques** gagne les **objets trouvés** et le **rythme de jeu** (🔮 objets par jour de jeu) ; une carte **⚖️ Vous et *pseudo*** compare ligne par ligne les **objets**, les **objets rares**, les **animaux**, le niveau, les mondes, les collections et les succès (`Vous 42 · Lui 120 (🔺 +78)`). |
| **Voir d'un coup d'œil depuis la liste d'amis** | Chaque ami affiche **📦 objets · 💎 objets rares · 🐾 animaux · ⭐ niveau** et une ligne **⚖️ Vous : …** pour se situer sans ouvrir la fiche. Le bouton **🔄 Tout rafraîchir** met à jour **tous les aperçus en un seul appel** au relais. |
| **« J'ai fait 3 Argile ancien et ça les met dans l'inventaire tous les 3 »** | Le nom est l'identité d'une création : deux créations homonymes ne font **qu'une seule entrée d'inventaire** (la seconde paire devient un raccourci), et une **migration** nettoie au chargement les parties déjà touchées (recettes repointées, découvertes fusionnées, compteur corrigé). Ce comportement est maintenant **vérifié dans le parcours réel** : trois fusions identiques ajoutent **un seul** objet, l'inventaire rendu l'annonce, et les fusions suivantes ne sont plus présentées comme une nouveauté. |

Les aperçus restent **bornés et sans donnée privée** (≤ 5 Ko, plafond du cache du relais à 8 Ko) : la limite a été relevée
juste ce qu'il fallait pour transporter les objets rares, tout en continuant à **revalider** chaque profil reçu
(listes tronquées, raretés inconnues ramenées à « Commun », identifiant recalculé à partir du pseudonyme).

La version est incrémentée en `1.4.0` (`package.json`, `GAME.version`) et le cache du service worker en `v7`,
condition pour que les visiteurs déjà venus reçoivent réellement cette mise à jour. `src/social/profil.js` rejoint
désormais la coquille pré-cachée, pour que la fiche d'ami fonctionne aussi **hors ligne**.

### Version 1.3.0 — profils d'amis et inventaire sans doublon

| Demande | Ce qui a été fait |
|---|---|
| **« Ajoute des options pour les amis : voir combien il a d'objets, ses statistiques, ses découvertes, ses animaux… »** | Chaque ami a un bouton **👁️ Voir le profil** : une fiche complète montre son **niveau et son XP**, ses **découvertes** (total, répartition par rareté, **12 dernières trouvailles** avec emoji et rareté), ses **animaux** (nom, emoji, niveau, équipe active), ses **mondes débloqués**, ses **collections**, ses **succès** et ses **statistiques** (fusions, quêtes, aides, jours de jeu, série, potions, amis). |
| **Comment l'ami voit-il ces informations ?** | Par le **relais** (bouton **📡 Publier mon profil**, rafraîchissement automatique toutes les 15 s) ou par un **code de profil** à transmettre (bouton **📋 Copier mon profil (code)**, collé dans « Profils partagés »). Aucun compte, aucun échange de mot de passe. |
| **Vie privée** | L'aperçu est **volontairement réduit et borné** (≤ 4 Ko) : il ne contient **jamais** la carte des découvertes, l'historique des fusions, les recettes, les paramètres ou la sauvegarde. Tout profil reçu est **revalidé** (liste blanche, valeurs bornées) avant d'être stocké, et un **identifiant annoncé n'est jamais cru** : il est recalculé à partir du pseudonyme, côté jeu comme côté relais. |
| **« J'ai fait 3 Argile ancien et ça les met dans l'inventaire tous les 3 »** | Le **nom devient l'identité** d'une création : si un élément porte déjà ce nom (accents et casse ignorés), la nouvelle paire est enregistrée comme **raccourci** vers cet élément — l'inventaire ne gagne **aucune entrée en double** et le jeu l'annonce (« ♻️ … existe déjà »). Une **migration** nettoie les parties déjà touchées au chargement : recettes repointées, découvertes fusionnées, compteur corrigé. |

La version est incrémentée en `1.3.0` (`package.json`, `GAME.version`) et le cache du service worker en `v6`
(puis `v7` avec la fiche d'ami détaillée de la version 1.4.0).

### Version 1.2.0 — système d'amis

| Demande | Ce qui a été fait |
|---|---|
| **« Rajoute un système d'amis : on tape le pseudo et l'ami reçoit une notification qui dit “voulez-vous l'ajouter dans vos amis ?” »** | Nouvel écran **👥 Amis** : on tape le pseudonyme de l'autre joueur, la demande part, et le destinataire reçoit une **modale de notification** avec deux boutons (« ❌ Refuser » / « ✅ Oui, ajouter »). Aucun compte, aucun e-mail : chacun est identifié par un **identifiant dérivé de son pseudonyme**, affiché sur l'écran Amis. |
| **« Un ami = +10 potions »** | Chaque ami accepté verse **exactement 10 potions aux deux joueurs** : immédiatement pour celui qui accepte, à réception de la confirmation pour l'autre. Une liste `cadeaux` garantit **une seule fois par personne** (retirer puis rajouter un ami ne redonne rien). Les potions sont celles des familiers : elles font monter un animal d'un niveau et rechargent son quota d'aides. |
| **Livrer la notification malgré l'absence de serveur** | Deux transports au choix : **code d'invitation** à coller (fonctionne toujours, aucun réglage) ou **relais d'amis facultatif** (URL publique dans les Paramètres) avec un exemple prêt à déployer, `server/worker-amis.js` (Cloudflare Worker + KV) et un relais local `tools/serveur-relais.mjs` pour tester à deux navigateurs. |
| **Sécurité** | Aucune clé d'API dans le navigateur, aucun mot de passe, aucun e-mail. Le relais ne reçoit que pseudonyme + identifiant dérivé + horodatage ; il livre chaque événement une seule fois et expire au bout de 7 jours. Les amis sont validés par **liste blanche** (`normaliserEtatAmis`) et exportés avec la partie. |

Deux défauts trouvés pendant la vérification à deux joueurs ont été corrigés avant livraison :
le relais remettait la **confirmation d'amitié au mauvais joueur** (elle repartait vers celui qui
acceptait au lieu de celui qui avait demandé — la logique et les tests ont été verrouillés sur
« `de` écrit, `vers` reçoit »), et l'acceptation ouvrait une **fenêtre de code inutile** par-dessus
la notification quand le relais avait déjà livré la confirmation.

La version est incrémentée en `1.2.0` (`package.json`, `GAME.version`) et le cache du service worker en `v5`,
condition pour que les visiteurs déjà venus reçoivent réellement cette mise à jour.

---

## 13. Limites connues

| Limite | Détail |
|---|---|
| **Mode hors ligne** | Nécessite une première visite en HTTPS pour installer le service worker. Les navigations et les données JSON sont servies « réseau d'abord » (mise à jour immédiate), les ressources sont affichées immédiatement puis rafraîchies en arrière-plan. **Publier une modification** de la coquille impose d'incrémenter `VERSION` dans `sw.js` : c'est ce qui purge l'ancien cache chez les visiteurs. Après une publication, un visiteur déjà venu peut avoir besoin de **deux rechargements** (le premier installe la nouvelle version, le second l'affiche). |
| **Stockage local** | Les données vivent dans le navigateur (IndexedDB, repli `localStorage`). Vider le cache ou les données du site **efface** les parties. Utilisez l'**export JSON** comme sauvegarde durable. Aucune récupération par e-mail n'existe : sans compte, il n'y a rien à récupérer côté serveur. |
| **Quota d'aides** | En mode purement local, un utilisateur expérimenté peut modifier le compteur dans le stockage du navigateur. Une limitation inviolable exigerait un serveur (voir `server/`). |
| **Recettes générées** | Les lots « candidats » ne sont pas des recettes officielles : ils ne comptent pas dans le compteur officiel et ne sont jamais présentés comme tels. |
| **Amis sans relais** | Sans relais configuré, la notification n'arrive pas « toute seule » : il faut transmettre un code d'invitation. Le relais d'amis est fourni en exemple mais **n'est pas déployé par le projet** (aucune donnée de joueur n'est collectée par l'auteur du jeu). |
| **Usurpation de pseudonyme** | Il n'y a ni compte ni mot de passe : n'importe qui peut se déclarer « Alex » et envoyer une demande. Le pseudo n'est pas une identité vérifiée — l'identifier n'a pas d'autre prétention que de distinguer deux joueurs. |
| **IA** | Facultative. Sans point d'entrée configuré, seul le composeur local est utilisé. |
| **Sauvegarde « en ligne »** | Non fournie : l'architecture est prévue, mais le jeu reste jouable entièrement hors ligne. |
| **Dépôt en lecture seule côté joueur** | Un site GitHub Pages ne peut pas écrire dans le dépôt : les découvertes des joueurs restent locales, et toute mise à jour du registre officiel passe par une nouvelle version du projet. |

---

## 14. Signaler un problème

Ouvrez une *issue* sur <https://github.com/vrcradio02/infinite-vrcraft/issues> en précisant
le navigateur, l'appareil, et les étapes qui reproduisent le problème.

## 15. Licence

MIT — voir [LICENSE](LICENSE).
