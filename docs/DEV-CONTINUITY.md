# Dev Continuity — Claude Code ↔ Codex (Git Handoff v1)

> Never lose your flow to an AI limit — y compris entre agents de développement.

## 1. Ce qui fonctionne aujourd’hui

`tools/handoff/` génère et vérifie un **paquet de passation standardisé**, indépendant du fournisseur.

| Commande | Rôle |
|---|---|
| `node tools/handoff/handoff.mjs create --from claude-code --to codex …` | Relève l’état Git (lecture seule) et écrit `docs/handoff/latest.json` + `docs/handoff/LATEST.md`. |
| `node tools/handoff/handoff.mjs verify` | L’agent qui reprend contrôle que la passation correspond au dépôt : dépôt, commit présent et publié, branche, travail non poussé chez l’agent précédent. Code de sortie 1 si incohérent. |
| `node tools/handoff/handoff.mjs show` | Affiche la passation en Markdown. |
| `npm run handoff -- create …` | Même chose via npm. |

Options de `create` : `--mission`, `--done`, `--notDone`, `--decisions`, `--constraints`, `--problems`, `--next` (répétables),
`--environment`, `--destination`, `--notes fichier.json` (mêmes clés), `--run "commande"` (exécute la vérification et enregistre le résultat réel), `--out dossier`.

Parcours de bout en bout (testé, `tests/handoff.test.cjs`) :
1. Claude Code approche de sa limite → `create --from claude-code --to codex --run "npm test" …` → commit + push de `docs/handoff/`.
2. Codex lit `AGENTS.md` → `docs/handoff/LATEST.md` → `verify` → reprend directement les « Prochaines actions ».
3. Codex s’arrête → `create --from codex --to claude-code` → push → Claude Code (`CLAUDE.md` → `AGENTS.md`) reprend.

## 2. Format `ai-flow.handoff/v1`

```
schema, createdAt, agents {from,to}
project      {repository (sans identifiants), branch, commit, commitSubject, commitDate, upstream, environment}
publication  {level: published | committed-not-pushed | local-changes | local-only | unverifiable, label}
git          {ahead, behind, unpushedCommits[], remoteBranchesContainingHead[], localChanges[{path,state}], stashes, recentCommits[], secretsInChanges{count,types}}
mission, done[], notDone[], decisions[], constraints[], problems[], next[]
tests[{command,result,exitCode,summary}]   « documenté, non exécuté » si seulement déclaré
destination, claims
```

- **Relevé automatiquement** (vérifiable) : section `project`, `publication`, `git`, et les `tests` lancés avec `--run`.
- **Déclaratif** (à vérifier) : mission, fait, décisions, problèmes, prochaines actions.
- La distinction exigée est appliquée : publié sur GitHub / commité non poussé / modifié localement / simplement documenté / non vérifiable.

## 3. Sécurité

- Uniquement des commandes Git **en lecture** (`rev-parse`, `status`, `log`, `diff`, `branch -r --contains`, `cat-file`). Aucun commit, push, fetch, reset ou stash automatique.
- Adresse du dépôt nettoyée des identifiants (`https://user:jeton@…` → `https://…`).
- Secrets détectés avec le même moteur que l’extension (`safari/sync.js`) dans les diffs, commits non poussés et fichiers non suivis ; signalés par type, **jamais recopiés** ; textes saisis masqués.
- Les remises (stash) sont comptées et signalées, jamais touchées.

## 4. Limites

- L’outil s’exécute **là où se trouve le dépôt** (session Claude Code, Codex cloud, Mac). L’extension Safari ne lit pas les fichiers du Mac : une intégration future passerait par l’app macOS (mécanisme natif autorisé), pas par l’extension.
- Le contexte conversationnel d’un agent (raisonnement non écrit) n’est capté que s’il est saisi dans les rubriques : c’est pourquoi `AGENTS.md` impose de régénérer la passation à chaque étape.
- La présence sur le dépôt distant est déduite des références distantes locales (dernière récupération) ; `verify` recommande `git fetch` si un commit est absent.
- Pas encore de détection automatique « Claude Code approche de sa limite » : aucune source fiable n’expose ce quota à l’extension aujourd’hui.

## 5. Architecture multi-fournisseurs (préparation, non développée)

Séparation retenue pour les prochaines intégrations, compatible avec le registre actuel `safari/platforms.js` :

| Notion | Exemple | Où aujourd’hui |
|---|---|---|
| Provider | Anthropic, OpenAI | implicite |
| Product | Claude (chat), Claude Code, ChatGPT, Codex | `PLATFORMS` (claude, codex, chatgpt) |
| Account | organisation Claude, empreinte du compte OpenAI | `ai_flow_accounts_v1` |
| Quota Capability | métriques, fenêtres, fiabilité | `METRICS`, `support` |
| Conversation Capability | capture / insertion | `resume`, `conversation`, `transferable()` |
| Agent Capability | dépôt Git, passation | **`tools/handoff`** (hors extension) |
| Availability | Disponible / proche / atteint / périmé / inconnu | `platformStatus().radar` |

Règle d’intégration d’un nouveau fournisseur (Gemini, Grok, Perplexity, Cursor, Copilot…) : vérifier les données réellement accessibles, la stabilité de la lecture, les permissions, séparer pris en charge / non pris en charge, tests, documentation — **jamais de compteur fictif**. Une plateforme peut être transférable sans être mesurable, et inversement.

## 6. Étapes suivantes (P2)

- **Intégration macOS** : bouton « Préparer la passation » dans l’app AI Flow Dev, sur un dossier choisi par l’utilisateur (accès explicite), réutilisant ce module.
- **AI Match / Adaptive Routing** : recommandations fondées sur des capacités déclarées + quotas mesurés + résultats observés dans les passations (`tests[]`), jamais sur un classement arbitraire.
- **Cross-Agent Review** : une passation `--to codex --mission "Revue du commit X"` suffit déjà comme base ; une commande dédiée pourra pré-remplir le diff et les tests.
- **Flow Spaces** : un espace = références (conversations, dépôt, passations, Flows) ; le schéma `ai_flow_flows_v1` (v1) restera intact, l’espace les référencera.
- **Context Health** : uniquement si un agent expose une mesure fiable du contexte ; alors proposer un point de reprise avant compaction.
