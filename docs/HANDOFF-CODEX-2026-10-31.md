# Passation Codex → Claude Code — 31 octobre 2026

## Base et état repris
- Dépôt `lcnd777/ai-flow`, seule branche publiée à la reprise : `main`, commit `9caaf154acb8eda6b5b351ee78122b22edd9c248` (0.13.0). Aucune PR trouvée. Copie fraîche et propre, travail sur `codex/sync-recovery-integrity` exclusivement.
- 0.12.0 (`6dabaec`) : Smart Transfer 2.0, extraction locale des rubriques, modes complet / continuité, taille et pièces jointes non transférées ; checkpoints, destination, Recovery sur relevé confirmé et timeline déjà implémentés.
- 0.12.1–0.12.3 : récupération depuis la page améliorée ; transfert masqué sur Claude Code / Codex non lisibles ; quotas de barre de menus retirés volontairement. Ne pas réintroduire ces fonctions sans nouveau cadrage.
- 0.13.0 : Smart Context Sync déjà implémenté (liaison, delta, décisions / conflits, journal, chiffrement local, UI et intégration Recovery). Aucune réécriture nécessaire.
- Les scénarios authentifiés et Safari Mac/iPhone/iPad restent à valider ; les tests Chromium documentés par Claude sont simulés. Les limites de reconnaissance déterministe des décisions et de lecture partielle restent applicables.
- Pas de note de passation dédiée, AGENTS.md ou CLAUDE.md trouvé ; README, CHANGELOG, SMART-CONTEXT-SYNC, VALIDATION et DEV-WORKFLOW lus. GitHub ne fournit ni changements locaux non poussés ni historique complet de Claude Code.

## Modifications et décisions
- `syncPrepare` exige désormais la révision de la capture (`baseRev`), fournie par la vue. Un aperçu périmé est rejeté avant l’annulation des brouillons existants. Une ancienne page ouverte sans ce champ doit être rechargée, puis recapturée.
- Contrôle de révision avant insertion, en plus du contrôle existant à la confirmation.
- Confirmation bloquée lorsque le brouillon manque / ne se déchiffre plus ou lorsque les décisions sont illisibles. Référence, journal, ciphertext et checkpoint restent intacts.
- Préparation bloquée pour un Flow verrouillé : pas de remise à zéro implicite des décisions. Reprendre avec la clé d’origine ; sinon dissocier explicitement et recréer la liaison. La clé ne devient pas exportable.
- Architecture conservée : écrivain sérialisé, schéma v1, chiffrement et insertion sans envoi. Aucune dépendance, permission, version de release ou source Swift modifiée.

## Tests
- Base avant modifications : `npm test` — **109/109**.
- Huit nouveaux cas ont échoué sur l’ancien code, puis sont passés avec les corrections (aperçu périmé, insertion périmée, brouillon absent / corrompu, clé perdue, décisions corrompues, préparation verrouillée, reprise d’une insertion déjà en attente).
- Suite complète après correction : **117/117** ; `node tools/build.mjs` réussi ; syntaxe JS et `git diff --check` valides.
- `node tests/e2e/run.cjs` et `node tests/e2e/update-cycle.cjs` tentés mais bloqués avant lancement : Chromium Playwright absent. Tentative d’installation échouée (archive téléchargée vide/invalide). Ne pas présenter les 83 vérifications historiques comme réexécutées ici.
- Pas de Safari, de Xcode, ni de sessions Claude/ChatGPT authentifiées dans cet environnement.

## Prochaines actions
1. Examiner et fusionner la PR après validation ; ne pas pousser directement sur main. La publication macOS automatique n’est pas déclenchée par cette branche.
2. Exécuter `xvfb-run -a node tests/e2e/run.cjs` et `xvfb-run -a node tests/e2e/update-cycle.cjs` avec Playwright/Chromium disponibles.
3. Sur Safari réel : lier Claude ↔ ChatGPT, capturer dans deux fenêtres, confirmer dans l’une, vérifier le rejet de l’autre ; fermer/réouvrir la page de synchronisation puis reprendre un brouillon valide.
4. Tester une restauration de sauvegarde dans un profil de test sans clé : aucune confirmation ni remise à zéro silencieuse. Garder le profil d’origine intact.
5. Vérifier les lecteurs / identifiants / pièces jointes et les zones de saisie sur comptes réels. Le relais automatique Claude Code ↔ Codex via GitHub n’est pas implémenté par cette PR : le transfert navigateur reste limité aux conversations Claude / ChatGPT prises en charge.

## Revue indépendante
Une revue a reproduit un contournement sur `pending-insert → pending-insert` après interruption : corrigé, test d’abord rouge puis vert. Point préexistant à traiter séparément : dans `sync-view.js`, reprendre une entrée du journal après une autre capture dans la même page laisse `res/items/entries` en mémoire ; vider cet état avant la reprise et ajouter un test UI. En attendant, reprendre depuis une page de synchronisation fraîchement ouverte. Ce point ne remet pas en cause les refus de révision ajoutés ici, mais mérite la prochaine correction de parcours.
