import { z } from 'zod'
import { picksOf, otherSide } from '#shared/draft'
import { assignRoles, enemyRoles } from '#shared/coach'
import type { CoachContext } from '#shared/coach'
import type { Role } from '#shared/types'
import { buildCoachPrompt } from './coach-prompt'
import type { CoachPrompt } from './coach-prompt'
import { askAi } from './coach-ai'
import type { Provider } from './coach-ai'

/** Our game plan for a finished draft, lane by lane (bot = ADC + support). */
export const PlanSchema = z.object({
  lanes: z.array(z.object({
    lane: z.enum(['top', 'jungle', 'mid', 'bot']),
    ours: z.string().describe('Our champion(s) and player(s) in this lane, e.g. "Garen (Oswald)"'),
    theirs: z.string().describe('Their champion(s) in this lane'),
    matchup: z.string().describe('Who wins the lane and why, one or two sentences'),
    scaling: z.string().describe('Who outscales in this lane (nous, eux or égal) and why'),
    early: z.string().describe('Early game: three short actions, separated by " · "'),
    mid: z.string().describe('Mid game: three short actions, separated by " · "'),
    late: z.string().describe('Late game: three short actions, separated by " · "'),
  })).length(4),
  fights: z.array(z.string()).describe('How to fight as a team: 2 to 4 concrete rules'),
  split: z.string().describe('When and how to split push, or why not'),
  synergies: z.array(z.string()).describe('Our team synergies to use in the games: 2 to 4'),
})
export type RawPlan = z.infer<typeof PlanSchema>

const LANES: { lane: 'top' | 'jungle' | 'mid' | 'bot', roles: Role[] }[] = [
  { lane: 'top', roles: ['top'] },
  { lane: 'jungle', roles: ['jungle'] },
  { lane: 'mid', roles: ['mid'] },
  { lane: 'bot', roles: ['adc', 'support'] },
]

const PLAN_RULES = `TASK: GAME PLAN. Write our plan for this draft, lane by lane (top, jungle, mid, bot), then the team plan.
- For each lane: the match-up (who wins and why), who outscales (nous, eux or égal) with the reason, and a concrete early, mid and late game: three short actions each.
- Then how to fight as a team (2 to 4 rules), when to split push (or why not), and the team synergies to use in the games.
- Use only the champions of this draft and our pools. The knowledge of the game (context above) is allowed; invent no number, no patch detail.
- French, short and actionable, like a coach talking to players.`

/** Each side's champions per lane: ours from our pools, theirs from the usual role of each champion. */
function lanesText(ctx: CoachContext, nameOf: (id: string) => string): string {
  const us = ctx.game.ourSide
  const them = otherSide(us)
  const ours = assignRoles(picksOf(ctx.game.actions, us), ctx.team)
  const theirs = enemyRoles(picksOf(ctx.game.actions, them), ctx.game.enemyRoles)
  const names = (map: Map<string, Role>, roles: Role[]) => [...map]
    .filter(([, r]) => roles.includes(r))
    .map(([c]) => nameOf(c))
  return LANES.map(({ lane, roles }) => {
    const o = names(ours, roles).join(' + ') || '(rôle non attribué)'
    const t = names(theirs, roles).join(' + ') || '(rôle non attribué)'
    return `- ${lane}: nous ${o} vs eux ${t}`
  }).join('\n')
}

export function buildPlanPrompt(ctx: CoachContext): CoachPrompt {
  const base = buildCoachPrompt(ctx)
  const byId = new Map(ctx.champions.map(c => [c.id, c.name]))
  const nameOf = (id: string) => byId.get(id) ?? id
  // Same context as the review (draft, pools, pro meta, notes), without the review's own task.
  const context = base.request.split('DATA ESTIMATE:')[0]!.trim()
  return {
    mode: 'review',
    system: base.system,
    team: base.team,
    request: `${context}\n\nLANES:\n${lanesText(ctx, nameOf)}\n\n${PLAN_RULES}`,
  }
}

/** Builds the plan for a finished game with the AI. Nothing is stored here: the route does it. */
export async function askPlan(ctx: CoachContext, provider?: Provider) {
  const prompt = buildPlanPrompt(ctx)
  const started = Date.now()
  const { raw, model } = await askAi(prompt, PlanSchema, provider)
  return { ...raw, model, ms: Date.now() - started }
}
