# Passation Claude Code → Codex

> Généré par AI Flow Git Handoff (ai-flow.handoff/v1) le 2026-11-01T11:39:25.234Z.
> **Git est la source de vérité.** Ce document résume ; il ne prouve pas que le code existe. Vérifie avec :
> `node tools/handoff/handoff.mjs verify`

## Projet
- Dépôt : https://github.com/lcnd777/ai-flow
- Branche : `main` (suit `origin/main`)
- Commit : `e36018eee71522199453f4908451cbe2dae875ac` — 0.15.0 : Dev Continuity sur Mac, Transfer Integrity, Quota Sentinel, recette
- Environnement : Session Claude Code cloud (Linux) : Node, Chromium Playwright ; macOS uniquement via GitHub Actions (macos-15). Pas de Safari ni de comptes authentifiés.

## État de publication
**Publié : le dépôt distant contient exactement ce commit.**

Modifications locales non commitées :
- Aucune

## Mission en cours
Mission V0.15.0 : continuité fiable (transfert, synchronisation), Transfer Integrity, Quota Sentinel, Dev Continuity accessible depuis l’app Mac.

## Travail terminé (déclaratif — à vérifier dans Git)
- 0.15.0 publiée (build 19, canal Sparkle dev) depuis main e36018e
- Dev Continuity macOS : macos/App/DevContinuity.swift (menu ⚡ › Dev Continuity…), cœur partagé tools/handoff/core.js exécuté par JavaScriptCore, auto-test --handoff-selftest en CI
- Transfer Integrity : A.transferIntegrity (shared.js) + encadré #integrity dans transfer.html/js
- Conversations longues : captureTab garde les messages récents, compte dropped/truncated
- Quota Sentinel : A.collectionHealth (shared.js), diag fails/lastOkAt/accountChangedAt (background.js saveDiag), backoff autoRefresh, bouton Actualiser (ui.js data-refresh-now), pastille
- Intitulés de continuité harmonisés ; e2e ChatGPT → Claude ; test restauration sauvegarde sans clé
- CI : branches claude/** et codex/** compilées sans publication (clé Sparkle seulement sur main)

## Travail non terminé
- Recette humaine docs/RECETTE-0.15.md (Safari réel, comptes réels, panneau Dev Continuity à la main)
- Smart Context Sync dans la vue de synchronisation : pas encore d’encadré d’intégrité unifié (liste d’avertissements existante)

## Décisions techniques et contraintes
- Git = source de vérité ; l’app ne fait que des lectures Git (liste fermée côté Swift) ; aucune écriture dans le projet sauf option explicite, jamais de commit/push
- Passation conservée dans ~/Library/Application Support/AI Flow Dev/Handoffs ; instructions copiées incluent la passation complète
- Une seule source de diagnostic de collecte (collectionHealth) pour toutes les interfaces
- Pas de quotas dans la barre de menus ; pas de Flow Spaces / AI Match / Orchestrator pour l’instant
- Les points de reprise restent en clair (documenté), les décisions de Flow chiffrées

## Vérifications
- `npm test` → réussi (# skipped 0 | # todo 0 | # duration_ms 3161.772842)

## Problèmes connus
- Aucune validation Safari réelle ni sur sessions Claude/ChatGPT authentifiées
- Git peut manquer sur le Mac de l’utilisateur : l’app propose xcode-select --install

## Prochaines actions
1. Lire le retour de recette de l’utilisateur (docs/RECETTE-0.15.md) et corriger
2. Encadré d’intégrité dans la vue « Synchroniser les avancées » (réutiliser transferIntegrity)
3. Publication assistée (commit + push explicitement validés) depuis le panneau Dev Continuity
4. Tests d’interface du panneau Dev Continuity (UI) si un runner macOS interactif devient disponible

## Pour Codex
Codex : lis AGENTS.md, puis lance la vérification ci-dessous avant toute modification. Si tes crédits sont limités, commite et pousse après chaque étape et régénère cette passation.

Règles : ne jamais effacer de modifications locales, pas de push forcé sans validation, ne pas considérer une PR ouverte comme intégrée ni une compilation réussie comme un déploiement.
