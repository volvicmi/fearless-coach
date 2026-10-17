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
| **Draft** | Séries (BO1/3/5, côté, score), board de draft à 20 étapes, verrous Fearless, coach IA (conseil sur notre tour, prédiction sur le leur, review en fin de draft avec winrate estimé). |
| **Prep** | Préparations par adversaire ; dans chacune, des drafts typés Engage / Poke / Front to back. **Seulement notre côté**, dans l'ordre réel du tournoi, avec plusieurs options par étape (la première = choix principal). |
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
- **Winrate** : la review part d'une estimation chiffrée (`shared/winrate.ts` : WR pro lissé, confort de nos joueurs, mix de dégâts) que l'IA peut ajuster de ±10 points au maximum, en expliquant pourquoi. Aucune autre statistique ne doit être inventée.
- **Ton** : français, direct, niveau compétitif, phrases courtes et actionnables, en raisonnant aussi sur l'ordre des picks et le côté.

## 6. Sources de données

- **Data Dragon** : champions et icônes (aujourd'hui `en_US`, passage à `fr_FR` prévu).
- **API Riot** : clé de développement (24 h) dans `.env` (`RIOT_API_KEY`), client limité en débit (`server/utils/riot.ts`). Bouton « Riot API key » en haut à droite pour la régénérer.
- **gol.gg** : **exception assumée** à la règle « pas de scraping ». Pages autorisées par leur robots.txt, une requête par seconde, User-Agent honnête, cache en base (une série terminée n'est jamais relue).
- Aucun autre site de stats (lolalytics, u.gg, op.gg…) sans en discuter d'abord.

## 7. Design

- Thème sombre (zinc) avec accents ambre/or, côté bleu et côté rouge bien distincts (`--color-side-blue`, `--color-side-red`).
- Cible possible plus tard, inspirée du client LoL sans éléments protégés : fonds `#010A13` / `#0A1428`, or `#C8AA6E` / `#C89B3C`, texte `#F0E6D2`, hextech `#0AC8B9`, polices Cinzel/Marcellus + Inter (jamais Beaufort ni Spiegel).
- Interdit : logos Riot/LoL, assets du client hors Data Dragon.
- Pied de page légal obligatoire (« Legal Jibber Jabber » de Riot), en français.
- Pas de texte sélectionnable pendant les glisser-déposer ; curseur pointer sur tout ce qui est cliquable.

## 8. Règles de travail pour Claude Code

- **Langue** : interface, messages d'erreur, commentaires et **messages de commit en français**. Noms de variables, fonctions et fichiers en anglais. Les réponses du coach IA sont en français.
- **Avant un gros module**, résumer ce qui va être fait et les fichiers touchés.
- **Vérifier** : `npm run typecheck` doit passer, et tout changement d'interface est vérifié dans le navigateur avant d'être annoncé terminé. Les données de test portent le préfixe `[test]` et sont supprimées après.
- **Tests** : pas encore de tests automatisés ; à ajouter (Vitest) en priorité pour `shared/draft.ts` (ordre, Fearless) et les schémas Zod du coach.
- **Secrets** : uniquement dans `.env` (ignoré par git) : `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `RIOT_API_KEY`. Le webhook Discord est stocké en base, jamais renvoyé au navigateur. Aucune clé dans le code ni dans les logs.
- **Pas de données inventées** : ni stats, ni infos de patch, ni quotas d'API écrits de mémoire. Vérifier dans la doc officielle ou demander.
- **Demander avant** : ajouter une dépendance, changer de fournisseur IA, migration destructive, déployer, envoyer un message Discord réel.
- **Git** : commits petits et clairs, en français, en local. Ne pas pousser ni déployer sans accord.

## 9. Mise en ligne (à venir)

Prévue quand les fonctionnalités seront stables. Points à traiter :

- Base : passer de SQLite à **Supabase** (Postgres, offre gratuite, Row Level Security sur toutes les tables). Les routes serveur passent en asynchrone.
- Hébergement : à décider (Netlify ou statique + Supabase). Sans serveur permanent : découper les imports Riot / gol.gg en petits lots, et passer le rappel Discord en tâche planifiée de l'hébergeur.
- **Connexion** obligatoire (Supabase Auth, Discord) avec liste blanche des membres : chacun remplit ses dispos lui-même.
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
