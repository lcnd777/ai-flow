# Instructions pour les agents (Codex, Claude Code, autres)

AI Flow — extension Safari / Chrome / Edge + app macOS. Langue du projet et des échanges : **français**.

## Reprendre un travail
1. Lis `docs/handoff/LATEST.md` (dernière passation), puis vérifie-la contre le dépôt :
   `node tools/handoff/handoff.mjs verify`
   Un résumé ne prouve pas que le code existe : **Git est la source de vérité**.
2. Ne refais pas d’audit complet si la passation et les commits récents suffisent.

## Pendant le travail
- Après chaque étape significative : `npm test`, commit, push, puis régénère la passation (ci-dessous).
- Tests navigateur (si Chromium/Playwright disponibles) : `xvfb-run -a node tests/e2e/run.cjs` et `xvfb-run -a node tests/e2e/update-cycle.cjs`.
- Publication : un push sur `main` déclenche la compilation macOS et le canal de mise à jour (voir `docs/DEV-WORKFLOW.md`).

## Avant de t’arrêter (limite proche, fin de session)
```bash
node tools/handoff/handoff.mjs create --from codex --to claude-code \
  --mission "…" --done "…" --notDone "…" --decisions "…" --problems "…" --next "…" --run "npm test"
```
(ou `--notes notes.json`). Commite et pousse `docs/handoff/`.

## Règles
- Ne jamais effacer de modifications locales, pas de push forcé, pas de secret dans les commits ou la passation.
- Ne pas considérer une PR ouverte comme intégrée, ni une compilation réussie comme un déploiement.
- Ne jamais committer la clé privée Sparkle ; ne pas changer les identifiants `ai.flow.dev*`.
- Conserver les travaux des autres agents : examiner avant de modifier.
- Confidentialité : voir `docs/PRIVACY.md` (aucun mot de passe/jeton stocké, lecture des conversations uniquement sur clic).
