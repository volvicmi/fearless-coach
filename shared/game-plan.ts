/**
 * Plan de jeu par rôle, lisible sur téléphone pendant un scrim.
 * Principes généraux, sans chiffres de patch : à adapter à l'équipe et à relire après chaque patch.
 */
export interface PlanPhase {
  label: string
  /** Une idée à retenir pour la phase */
  focus: string
  /** Trois actions simples, concrètes */
  steps: string[]
}

export interface RolePlan {
  id: 'top' | 'jungle' | 'mid' | 'adc' | 'support'
  label: string
  /** La règle d'or du rôle, à lire avant chaque game */
  golden: string
  phases: { early: PlanPhase, mid: PlanPhase, late: PlanPhase }
}

export const GAME_PLAN: RolePlan[] = [
  {
    id: 'top',
    label: 'Top',
    golden: 'Ne meurs pas pour rien : une lane saine vaut plus qu’un kill risqué.',
    phases: {
      early: { label: 'Early', focus: 'Farmer et tenir la lane', steps: ['Farme sans te faire toucher', 'Tiens la vague avant de roam', 'Trade seulement quand ton sort est là'] },
      mid: { label: 'Mid', focus: 'Tenir la pression et suivre les objectifs', steps: ['Tp sur les combats d’objectif (dragon, héraut)', 'Pousse une lane latérale pour occuper', 'Recule si l’équipe n’est pas groupée'] },
      late: { label: 'Late', focus: 'Ne pas arriver seul au combat', steps: ['Split si l’équipe peut grouper derrière toi', 'Sinon reste devant avec les tanks', 'Ne rentre jamais seul dans un teamfight'] },
    },
  },
  {
    id: 'jungle',
    label: 'Jungle',
    golden: 'Tu donnes le rythme : chaque gank doit suivre une vision ou une lane qui pousse.',
    phases: {
      early: { label: 'Early', focus: 'Clear sûr et premier gank utile', steps: ['Clear sécurisé, sans te faire voler', 'Gank la lane qui a déjà un avantage', 'Invade seulement si le jungler adverse est en retard'] },
      mid: { label: 'Mid', focus: 'Contrôler les objectifs', steps: ['Pose la vision avant chaque objectif', 'Synchronise-toi avec la lane qui pousse', 'Ne prends pas un objectif sans équipe'] },
      late: { label: 'Late', focus: 'Vision et première engagement', steps: ['Ward le baron et les zones de passage', 'Engage ou protège la vision de l’équipe', 'Reste proche des carries pendant les combats'] },
    },
  },
  {
    id: 'mid',
    label: 'Mid',
    golden: 'Le mid donne de l’or et de la vision : ne farme pas seul quand la team a besoin de toi.',
    phases: {
      early: { label: 'Early', focus: 'Contrôler la vague et roam utile', steps: ['Garde la vague, ne farme pas sous tour sans vision', 'Roam quand le jungler peut suivre', 'Évite les trades qui ne rapportent rien'] },
      mid: { label: 'Mid', focus: 'Ouvrir la map', steps: ['Pousse une lane pour ouvrir la carte', 'Garde la vision au milieu', 'Rejoins les objectifs à temps'] },
      late: { label: 'Late', focus: 'Tuer les carries', steps: ['Reste derrière la ligne avant', 'Cible les carries adverses en premier', 'Garde une téléportation ou un escape pour un teamfight'] },
    },
  },
  {
    id: 'adc',
    label: 'ADC',
    golden: 'Ta vie est la ressource la plus précieuse de la team : positionne-toi, ne cherche pas le kill.',
    phases: {
      early: { label: 'Early', focus: 'Farmer sous tour sans risque', steps: ['Farme sous tour, sans trade inutile', 'Surveille le support avant chaque all-in', 'Ne vas pas dans une brousse sans vision'] },
      mid: { label: 'Mid', focus: 'Suivre l’équipe', steps: ['Reste avec le support pendant les rotations', 'Prends les tours quand la lane est libre', 'Va sur les objectifs avec l’équipe'] },
      late: { label: 'Late', focus: 'Positionnement', steps: ['Derrière le tank, jamais en tête', 'Focus le carry adverse', 'Recule dès que tu n’as plus de sort ou de vie'] },
    },
  },
  {
    id: 'support',
    label: 'Support',
    golden: 'Tu es la vision et la protection : ward d’abord, engage ensuite.',
    phases: {
      early: { label: 'Early', focus: 'Vision et protection', steps: ['Pose les wards avant de trader', 'Protège le tireur pendant le farm', 'Trade quand le tireur peut punir'] },
      mid: { label: 'Mid', focus: 'Vision sur les objectifs', steps: ['Ward les objectifs avant qu’ils commencent', 'Roam avec le mid si la lane est sûre', 'Engage seulement si le teamfight est gagnable'] },
      late: { label: 'Late', focus: 'Garder le carry en vie', steps: ['Peel le carry contre les assassins', 'Ward les zones de passage avant le baron', 'Garde un sort de protection pour le carry'] },
    },
  },
]
