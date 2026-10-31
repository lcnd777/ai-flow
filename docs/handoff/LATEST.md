# Passation Claude Code → Codex

> Généré par AI Flow Git Handoff (ai-flow.handoff/v1) le 2026-10-31T23:39:18.862Z.
> **Git est la source de vérité.** Ce document résume ; il ne prouve pas que le code existe. Vérifie avec :
> `node tools/handoff/handoff.mjs verify`

## Projet
- Dépôt : https://github.com/lcnd777/ai-flow
- Branche : `main` (suit `origin/main`)
- Commit : `492cbea67edc19889867056c00ad6e283db98b48` — 0.14.0 : Git Handoff v1 (Claude Code ↔ Codex), actions de continuité clarifiées
- Environnement : Session Claude Code cloud (Linux), Node + Chromium Playwright disponibles ; pas de Safari ni de sessions authentifiées.

## État de publication
**Publié : le dépôt distant contient exactement ce commit.**

Modifications locales non commitées :
- Aucune

## Mission en cours
Mission « AI Flow — vision produit complète » : fiabiliser P0, clarifier la continuité, livrer Dev Continuity (Git Handoff v1), préparer P2 sans surdévelopper.

## Travail terminé (déclaratif — à vérifier dans Git)
- 0.14.0 publiée : Git Handoff v1 (tools/handoff, tests/handoff.test.cjs), AGENTS.md, CLAUDE.md, docs/DEV-CONTINUITY.md
- Libellés de continuité : Continuer sur X / Sauvegarder pour plus tard / Synchroniser les avancées (popup, pastille, page de sauvegarde)
- PR #2 fermée (contenu déjà dans main)
- 0.13.x : Smart Switch (alternative disponible uniquement), fenêtre 460×600, graphique multi-plateformes (Codex), fiabilité Smart Context Sync (Codex)

## Travail non terminé
- Quota Sentinel : diagnostics existants (connexion, relevé ancien) mais pas de détection dédiée « collecte inactive / réponse non reconnue » visible discrètement
- Transfer Integrity : signalements existants (pièces jointes, taille, secrets, messages omis) ; pas encore de récapitulatif unique avant envoi
- Intégration macOS de Git Handoff (choix d’un dossier dans l’app AI Flow Dev)
- Flow Spaces, AI Match, Decision Vault étendu : documentés seulement (docs/DEV-CONTINUITY.md §5-6)

## Décisions techniques et contraintes
- Git est la source de vérité ; la passation ne fait que des lectures Git, jamais de commit/push automatique
- Pas de quotas dans la barre de menus tant que la communication extension → app n’est pas démontrée
- Smart Switch affiché seulement si une autre plateforme a une capacité confirmée
- Aucune nouvelle page principale par fonctionnalité

## Vérifications
- `npm test` → réussi (# skipped 0 | # todo 0 | # duration_ms 3162.703716)

## Problèmes connus
- Aucune validation sur Safari réel ni sur comptes Claude/ChatGPT authentifiés (formats d’API reproduits)
- Le test e2e de l’infobulle dépendait de l’heure : corrigé (survol de la dernière tranche mesurée)

## Prochaines actions
1. Vérifier avec l’utilisateur sur Safari Mac : libellés de continuité, Smart Switch, synchronisation réelle Claude ↔ ChatGPT
2. Quota Sentinel : statut discret par plateforme (collecte inactive, session expirée, réponse non reconnue) à partir de ai_flow_diagnostics_v1
3. Transfer Integrity : récapitulatif « ce qui part / ce qui ne part pas » au-dessus du bouton d’envoi
4. Intégration Git Handoff dans l’app macOS (dossier choisi explicitement)

## Pour Codex
Codex : lis AGENTS.md, puis lance la vérification ci-dessous avant toute modification. Si tes crédits sont limités, commite et pousse après chaque étape et régénère cette passation.

Règles : ne jamais effacer de modifications locales, pas de push forcé sans validation, ne pas considérer une PR ouverte comme intégrée ni une compilation réussie comme un déploiement.
