# Connecteurs de quotas — ce qui est réellement lu

Depuis la 0.9.0, AI Flow n’affiche que **Claude et Codex**, les deux IA dont les limites sont lisibles de façon fiable (Grok, expérimental et non vérifiable, a été retiré). Les autres lignes du tableau expliquent pourquoi elles ne sont pas proposées.

Chaque plateforme est décrite dans `safari/platforms.js` : hôtes, limites, niveau de support et note. Son lecteur éventuel se trouve dans `safari/readers.js`. Un lecteur est une fonction autonome, exécutée **dans l'onglet officiel déjà ouvert** (`scripting.executeScript`, monde `MAIN`). Elle utilise donc la session de l'utilisateur sans qu'AI Flow voie ni stocke ses cookies ou jetons. Elle ne renvoie que des pourcentages, des dates de reset et un libellé court. Le background revalide tout (`sanitizeReadings`) avant d'écrire.

| Plateforme | Niveau | Source | Limites | Vérifié |
|---|---|---|---|---|
| Claude | Lecture auto | `GET /api/organizations` puis `/api/organizations/{id}/usage` (API web interne, non documentée) | Session 5 h, semaine, Sonnet, Opus | Réponses simulées. Format confirmé lors des versions précédentes par l'utilisateur. |
| Codex | Lecture auto | `GET /api/auth/session` puis `/backend-api/wham/usage` (interne). Le jeton reste dans la fonction, dans l'onglet. | Session 5 h, semaine, revue de code. Seules les fenêtres de 18 000 s et 604 800 s sont acceptées. | Réponses simulées. Lecture confirmée sur compte réel par l'utilisateur (0.7). |
| ChatGPT (conversations) | **Non mesuré** | Aucune API ni compteur fiable pour GPT, Thinking ou Pro | — | — |
| Gemini | **Non mesuré** | L'app Gemini n'expose ni compteur ni API de quota grand public. L'API Gemini (clé développeur) ne fournit pas non plus de consommation restante. | — | — |
| GitHub Copilot | **Non mesuré** (connecteur préparé) | Requêtes premium visibles sur github.com/settings/copilot. L'API `copilot_internal` exige un jeton d'IDE : hors de portée d'une extension, et non documentée. | — | — |
| Cursor | **Non mesuré** (connecteur préparé) | Le tableau de bord utilise des endpoints internes liés au cookie de session (non documentés, pas d'identifiant accessible sans lire les cookies). | — | — |
| Perplexity | **Non mesuré** | Pas de compteur exposé de manière fiable | — | — |
| Microsoft Copilot | **Non mesuré** | Aucun quota public | — | — |

## Ajouter un connecteur

1. Dans `platforms.js`, renseigne `support:'live'|'experimental'`, `reader:'<nom>'`, `metrics:{'<id>.<limite>':'Libellé'}` et `primary`.
2. Dans `readers.js`, écris une fonction **autonome**. Elle vérifie le domaine, utilise `fetch` en même origine avec `credentials:'include'` et un délai maximal. Elle renvoie `{status:'ok'|'partial'|'login'|'no-figures'|…, readings:[{id,percent,resetAt}]}` et refuse toute valeur ambiguë.
3. Ajoute l'hôte dans `host_permissions` (et dans `content_scripts.matches` si un widget est utile).
4. Ajoute des tests dans `tests/readers.test.cjs` (réponse valide, invalide, 401/403, mauvais domaine).

## Fragilité et risques des méthodes non officielles

Les lecteurs Claude et Codex utilisent des endpoints internes, sans documentation ni engagement de stabilité. Un changement côté plateforme les fait passer en « Indisponible : réponse non reconnue », jamais à une fausse valeur. Ils n'effectuent que des lectures, au plus une fois par minute et par plateforme, seulement si un onglet est déjà ouvert. Les conditions d'utilisation d'Anthropic et OpenAI encadrent l'accès automatisé à leurs services : cette lecture reste à l'initiative et sous la responsabilité de l'utilisateur. La relance automatique (envoi d'un message) est plus sensible encore. Elle est désactivée par défaut, armée explicitement, n'envoie qu'une seule fois et reste annulable.

## Études 0.10.0 (non intégrées, et pourquoi)

- **Grok** : endpoint interne `rest/rate-limits` non vérifiable sur compte réel depuis l’environnement de développement. Retiré en 0.9.0 et non réintégré.
- **Statut des services** : les pages de statut Anthropic (status.anthropic.com) et OpenAI exposent un état public. L’intégrer distinguerait une panne fournisseur d’un problème de connecteur, mais demanderait de nouvelles permissions d’hôte, et le format OpenAI a changé en 2025. Reporté.
- **Multi-comptes** : un changement de compte efface déjà les relevés de l’ancien compte (jamais de mélange). Une vue côte à côte demanderait de stocker par compte un identifiant. Reporté.
- **Context Health** : la longueur visible d’une conversation ne reflète pas la fenêtre de contexte réelle du modèle. Non intégré pour ne pas afficher d’indicateur trompeur.
