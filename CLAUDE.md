# Fearless Coach — outil de draft de l'équipe

Outil web privé pour notre équipe League of Legends (scrims et tournois, **toujours en Fearless**) : préparer les drafts, suivre la série en direct, gérer les pools et les dispos, et obtenir les conseils d'un coach IA.

Ce fichier décrit **le projet tel qu'il existe** et fixe les règles de travail pour Claude Code. Le lire en entier avant toute tâche, et le tenir à jour quand une décision change.

---

## 1. Contexte

- **Équipe** : 5 titulaires (le cinq de départ) + des remplaçants. Statut `starter` / `sub` par joueur (onglet Équipe).
- **Format** : scrims et tournois en BO1, BO3 ou BO5, **Fearless strict** uniquement (décision de l'équipe : pas de Fearless d'équipe).
- **La draft réelle se fait sur drafter.lol.** L'outil sert à la saisir en direct (ou après), à la préparer et à l'analyser.
- **Budget : 0 €.** Aucun service payant. L'IA tourne sur l'offre gratuite de Gemini ; Claude est optionnel (clé payante).
- **Aujourd'hui l'app tourne en local** sur le PC du coach. La mise en ligne est prévue plus tard (voir §9).

## 2. Ce que fait l'outil (onglets)

| Onglet | Contenu |
|---|---|
| **Draft** | Deux modes de série (BO1/3/5, côté, score). **Équipe** : board de draft à 20 étapes, verrous Fearless, coach IA (conseil sur notre tour, prédiction sur le leur, review en fin de draft avec winrate estimé). **Duel 1v1** : deux joueurs draftent l'un contre l'autre, sans conseil IA ; à la fin de chaque draft l'IA désigne le vainqueur (voir §5). L'accueil montre les séries en cartes (En cours / Terminées). |
| **Prep** | Galerie des compositions filtrable par préparation, champion et type Engage / Poke / Front to back. Au clic : cinq rôles avec splash arts, alternatives, combos entre deux picks, bans et sélecteur latéral. **Seulement notre côté** ; l'ordre réel du tournoi reste stocké même si l'affichage est trié par rôle. La première option est le choix principal. Rôles et combos sont enregistrés par composition et copiés à la duplication ; appliquer un duo conserve les précédents choix comme alternatives. |
| **Équipe** | Un onglet par joueur : tier list S/A/B/C + ligne Practice (glisser-déposer, ordre dans le tier = force), stats ranked (SoloQ / Flex via l'API Riot). Onglet **Combos** : un champion et ses partenaires (Jhin + Shen / Camille / Alistar…). |
| **Planning** | Jours habituels par joueur (heure, 21:00 par défaut), exceptions par date, vue semaine avec l'état du cinq de départ, rappel Discord hebdomadaire par webhook. |
| **Pro** | Stats champions et vraies drafts pro importées de gol.gg (LCK / LEC), tri par colonne, tournoi en cours. |
| **Notes** | Notes libres en markdown envoyées au coach IA à chaque demande. |

## 3. Règles de draft à respecter dans le code

### Ordre de la draft de tournoi

```
Bans phase 1  : B1 R1 B2 R2 B3 R3
Picks phase 1 : B1 R1 R2 B2 B3 R3
Bans phase 2  : R4 B4 R5 B5
Picks phase 2 : R4 B4 B5 R5
```

Une seule constante : `DRAFT_ORDER` dans `shared/draft.ts`. Tout le reste (board, prep, imports gol.gg, prompts) s'appuie dessus. Les drafts sont stockées en tableaux de 20 entrées dans cet ordre.

### Fearless

- **Fearless strict** : un champion pické par l'une ou l'autre équipe dans une partie précédente de la série est bloqué pour **les deux** équipes.
- Les **bans ne sont pas** concernés.
- Logique unique et pure : `fearlessLocked()` dans `shared/draft.ts`, réutilisée partout (board, suggestions, coach). Les champions bloqués sont grisés.

### Rôles

`top`, `jungle`, `mid`, `adc`, `support`.

## 4. Architecture actuelle

```
Nuxt 4 (Vue 3) + Tailwind v4          app/
   └─ serveur Nitro (routes API)      server/api/, server/utils/, server/tasks/
         ├─ SQLite (node:sqlite)      data/coach.db (hors git)
         ├─ IA : Gemini (gratuit, chaîne de modèles) ou Claude
         ├─ API Riot (ranked des joueurs)
         ├─ gol.gg (stats et drafts pro)
         └─ Discord (webhook du rappel planning)
Data Dragon (Riot) : champions et icônes
```

- **Code partagé client/serveur** dans `shared/` : `draft.ts` (ordre, Fearless), `coach.ts` (suggestions instantanées), `winrate.ts` (estimation chiffrée), `planning.ts`, `types.ts`.
- **Glisser-déposer** : GSAP Draggable via `app/composables/useChampionDrag.ts` (zones `data-tier-drop`, sources `data-drag-champ`), utilisé par les tier lists, la prep et les combos.
- **Routes API** : importer explicitement les utilitaires (`import { … } from '../../utils/…'`) dans les nouvelles routes ; le scan d'auto-import du serveur de dev peut être en retard.
- **Ne pas modifier de fichier serveur pendant un import** (gol.gg, Riot) : le rechargement du serveur coupe la tâche (elle reprend ensuite là où elle s'est arrêtée).

### Base de données (SQLite, migrations dans `server/utils/db.ts`)

`series`, `games`, `players` (+ `puuid`, `status`), `pool_entries` (tier, position, note), `combos`, `preps`, `prep_scenarios`, `availability_habits`, `availability_exceptions`, `riot_matches`, `player_games`, `pro_tournaments`, `pro_champ_stats`, `pro_series`, `pro_games`, `settings` (notes, webhook, tournoi en cours…).

- Les champions sont stockés par leur **id Data Dragon** (`MonkeyKing`, pas « Wukong »).
- Les migrations sont additives (`CREATE TABLE IF NOT EXISTS`, `addColumn`) ; une migration destructive se demande avant.

## 5. Coach IA

- **Fournisseurs** : `server/utils/coach-gemini.ts` (chaîne de modèles gratuits, ordre réglable par `NUXT_GEMINI_MODELS`, un modèle en 429 est mis de côté 10 min) et `server/utils/coach-claude.ts`. Choix automatique selon les clés présentes (`NUXT_COACH_PROVIDER` pour forcer).
- **Un seul constructeur de prompt** : `server/utils/coach-prompt.ts`, réutilisé par le bouton « Copier le contexte ».
- **Connaissances du jeu** dans `context/regles.md` (stable, ajouté au prompt système). Les données d'équipe (pools, tiers, combos, titulaires) ne sont **jamais recopiées dans un fichier** : le prompt les lit directement en base, comme l'onglet Équipe. Pas de fichier de patch à maintenir à la main.
- **Sources pesées ensemble, sans priorité** : tous les champions disponibles, tier lists, stats ranked, méta et drafts pro, notes, combos, drafts préparées (celles contre l'adversaire d'abord), état de la série et Fearless.
- **Réponses en JSON validé par Zod** avant affichage (conseil, prédiction, review).
- **Duel 1v1** (`series.mode = 'duel'`) : jamais de conseil pendant la draft (`loadCoachContext` refuse). À la fin des 20 étapes, `server/utils/duel-judge.ts` (route `POST /api/duel/judge`) départage : vainqueur, % de chaque côté, points forts, ce qui manque, comment mieux drafter. Le % repart de `estimateWinRate` (force pro + mix de dégâts, sans équipe) et reste à ±10 points ; **le vainqueur vient du % final**, enregistré avec le verdict (`games.verdict` en JSON, `games.winner`). Le score de la série est la somme de ces verdicts. Le prompt n'a jamais les noms saisis par les joueurs (« Joueur 1 » / « Joueur 2 », remplacés après coup) : un nom ne peut pas influencer le juge. Modifier la draft efface le verdict. Dans un duel, `games.our_side` = le côté du joueur 1.
- **Winrate** : la review part d'une estimation chiffrée (`shared/winrate.ts` : WR pro lissé, confort de nos joueurs, mix de dégâts) que l'IA peut ajuster de ±10 points au maximum, en expliquant pourquoi. Aucune autre statistique ne doit être inventée.
- **Ton** : français, direct, niveau compétitif, phrases courtes et actionnables, en raisonnant aussi sur l'ordre des picks et le côté.

## 6. Sources de données

- **Data Dragon** : champions et icônes (aujourd'hui `en_US`, passage à `fr_FR` prévu).
- **API Riot** : clé de développement (24 h) dans `.env` (`RIOT_API_KEY`), client limité en débit (`server/utils/riot.ts`). Bouton « Riot API key » en haut à droite pour la régénérer.
- **gol.gg** : **exception assumée** à la règle « pas de scraping ». Pages autorisées par leur robots.txt, une requête par seconde, User-Agent honnête, cache en base (une série terminée n'est jamais relue).
- Aucun autre site de stats (lolalytics, u.gg, op.gg…) sans en discuter d'abord.

## 7. Design (charte « Régie », Opif Gaming)

- **Thème sombre uniquement.** Graphite légèrement bleuté ; la gamme `zinc` de Tailwind est redéfinie dans `app/assets/css/main.css` (950 = fond `#0B0D13`, 900 = surface `#131620`, 800 = relief `#1C2030`), et la gamme `amber` = violet de la corne (400 = `#A99CFF`). Utiliser ces classes, pas de couleurs en dur.
- **Aucune bordure autour des blocs** : un panneau se détache par sa teinte (`bg-zinc-900` sur le fond). Classe `cut` = coin haut droit coupé.
- **Action principale** : classe `btn-action` (dégradé de la corne, parallélogramme). Secondaire : `bg-zinc-800` en capitales. Champ actif et puce sélectionnée : filet violet en bas (`shadow-[inset_0_-2px_0_var(--color-amber-400)]`).
- **Typo** : Saira Condensed (`font-display`, capitales) pour titres, onglets, scores ; Barlow pour le texte. Chargées depuis Google Fonts (`nuxt.config.ts`).
- Côtés : bandeaux pleins `bg-side-blue` / `bg-side-red`, texte blanc. Dégradé de la corne (`--horn`) réservé à ce qui est actif.
- Référence visuelle : `../charte/propositions/charte-opif.html` (variante C2 Régie).
- Interdit : logos Riot/LoL, assets du client hors Data Dragon.
- Pied de page légal obligatoire (« Legal Jibber Jabber » de Riot), en français.
- Pas de texte sélectionnable pendant les glisser-déposer ; curseur pointer sur tout ce qui est cliquable.

## 8. Règles de travail pour Claude Code

- **Langue** : interface, messages d'erreur, commentaires et **messages de commit en français**. Noms de variables, fonctions et fichiers en anglais. Les réponses du coach IA sont en français.
- **Avant un gros module**, résumer ce qui va être fait et les fichiers touchés.
- **Vérifier** : `npm run typecheck` doit toujours passer (sa sortie est courte, il coûte peu). **Pas de test navigateur systématique** : il coûte cher en tokens. On teste dans le navigateur seulement pour un nouvel écran ou un nouveau parcours, ou quand le coach le demande ; dans ce cas, lire le texte de la page plutôt que prendre des captures, et peu d'appels. Les données de test portent le préfixe `[test]` et sont supprimées après.
- **Tests** : la logique pure est testée par des tests unitaires (Vitest) écrits par un membre de l'équipe : `shared/draft.ts` (ordre, Fearless, score des séries), les schémas Zod du coach. Ne pas dupliquer ces tests dans le navigateur.
- **Sobriété en tokens** : réponses courtes, pas de récapitulatif des fichiers modifiés quand le diff suffit, lire seulement les fichiers nécessaires, et proposer `/compact` ou une nouvelle session quand la conversation devient longue.
- **Secrets** : uniquement dans `.env` (ignoré par git) : `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `RIOT_API_KEY`. Le webhook Discord est stocké en base, jamais renvoyé au navigateur. Aucune clé dans le code ni dans les logs.
- **Pas de données inventées** : ni stats, ni infos de patch, ni quotas d'API écrits de mémoire. Vérifier dans la doc officielle ou demander.
- **Demander avant** : ajouter une dépendance, changer de fournisseur IA, migration destructive, déployer, envoyer un message Discord réel.
- **Git** : commits petits et clairs, en français, en local. Ne pas pousser ni déployer sans accord. **Chaque `git commit` et `git push` doit être validé par le coach avant exécution** (règle `ask` dans `.claude/settings.json`) : un push part directement en production (redéploiement automatique Coolify).

## 9. Mise en ligne (à venir)

Prévue quand les fonctionnalités seront stables. Points à traiter :

- Base : passer de SQLite à **Supabase** (Postgres, offre gratuite, Row Level Security sur toutes les tables). Les routes serveur passent en asynchrone.
- Hébergement : à décider (Netlify ou statique + Supabase). Sans serveur permanent : découper les imports Riot / gol.gg en petits lots, et passer le rappel Discord en tâche planifiée de l'hébergeur.
- **Connexion** obligatoire (Supabase Auth, Discord) avec liste blanche des membres : chacun remplit ses dispos lui-même.
- **Duel 1v1 en ligne** : aujourd'hui les deux joueurs partagent le même écran, chacun son tour. En ligne, chaque joueur aura son propre navigateur : prévoir de lier un compte à chaque côté (le joueur ne peut jouer que ses propres étapes) et de synchroniser le board en temps réel (Supabase Realtime). Tout l'état d'un duel est déjà côté serveur, donc cette étape n'a pas à refaire le modèle de données.
- Clés IA / Riot côté serveur uniquement (secrets de l'hébergeur ou Edge Functions).
- Supabase gratuit se met en pause après 7 jours sans activité : le rappel hebdomadaire suffit à le garder éveillé.

## 10. Commandes

```bash
npm install          # dépendances
npm run dev          # serveur de dev sur http://localhost:3000
npm run typecheck    # vérification TypeScript (doit passer)
npm run build        # build de production
```

## 11. Idées pour la suite

- Tests Vitest (draft, Fearless, schémas du coach).
- Data Dragon en `fr_FR` et descriptions des sorts dans le prompt du coach.
- Coach centré sur le tournoi en cours et sur les titulaires / remplaçants sélectionnés.
- Fiches adversaires (joueurs, champions favoris, historique de leurs drafts contre nous).
- Import de la draft finale depuis une capture d'écran de drafter.lol (Gemini lit les images).
- Fiche « plan de jeu » lisible sur téléphone.
