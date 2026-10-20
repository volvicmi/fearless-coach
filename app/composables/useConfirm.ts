// Fenêtre de confirmation de l'app (remplace confirm() du navigateur) : `if (!(await askConfirm('…'))) return`
export interface ConfirmOptions {
  /** Texte du bouton de validation (« Supprimer », « Publier »…) */
  confirmLabel?: string
  /** Action destructrice : bouton rouge */
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions { message: string }

let resolver: ((ok: boolean) => void) | null = null

export function useConfirmState() {
  return useState<ConfirmState | null>('confirm-dialog', () => null)
}

export function askConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const state = useConfirmState()
  resolver?.(false) // une seule question à la fois
  state.value = { message, ...options }
  return new Promise((resolve) => { resolver = resolve })
}

export function answerConfirm(ok: boolean) {
  useConfirmState().value = null
  resolver?.(ok)
  resolver = null
}
