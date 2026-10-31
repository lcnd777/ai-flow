## V0.6.0 — Claude (expérimental)

Le suivi Claude peut être activé dans le tableau de bord : deux requêtes GET vers les endpoints internes et authentifiés de claude.ai (`/api/organizations` et `/api/organizations/<id>/usage`) sont utilisées uniquement après opt-in. Les données de quota restent locales. En cas d’échec, le panneau de diagnostic montre la catégorie d’erreur sans corps de réponse ni identifiant.

Cette interface privée est susceptible de changer et son accessibilité sur Safari réel doit être confirmée. La lecture DOM sur `claude.ai/settings/usage` est conservée en secours. Safari peut interrompre l’exécution en arrière-plan. Un quota inconnu ne doit jamais être interprété comme 0.

# Sources, quotas et choix de connecteurs — 30 octobre 2026

## Ce qui a pu être vérifié

La documentation développeur OpenAI sur la tarification Codex a été récupérée directement via HTTPS. Elle renvoie vers `https://chatgpt.com/codex/settings/usage` pour consulter les limites/reset, indique une consommation commune Work/Codex, et explique que la consommation dépend notamment des tâches et des modèles. Ses estimations de nombre de messages ne sont pas des plafonds fixes. Le code ne transforme donc pas un nombre de messages ou de caractères en pourcentage.

Elle distingue les offres : une fenêtre de cinq heures pour les estimations Plus/Business standard, absence de cette limite de cinq heures pour Pro à la date de consultation, limites hebdomadaires possibles, et cas Enterprise/Edu à crédits. Ces règles peuvent évoluer : AI Flow n’infère ni l’abonnement ni les jauges absentes. « Indisponible » peut signifier « non exposé/non applicable ».

Source consultée : https://developers.openai.com/codex/pricing/

La page d’authentification Codex a aussi été consultée, mais aucun flux de jeton ou clé API n’a été intégré : https://developers.openai.com/codex/auth/

## Ce qui n’a pas pu être vérifié

Les deux moteurs de recherche disponibles ont renvoyé des erreurs. Les centres d’aide Claude/OpenAI ont répondu HTTP 403 lors de l’accès direct. Aucun contournement de ces protections n’a été tenté. Ces pages ne sont pas présentées comme lues :

- https://support.claude.com/en/articles/9797557-usage-limit-best-practices
- https://help.openai.com/en/articles/11909943-gpt-5-in-chatgpt

L’interface authentifiée des tableaux de bord n’a pas été inspectée. Les sélecteurs Claude et Codex sont donc des adaptateurs expérimentaux testés sur fixtures, pas un schéma officiel garanti. La durée de session Claude, les limites par modèle et leurs intitulés sont des cibles du cahier des charges ; aucune formule de quota contractuel n’est codée en dur.

## Matrice

| Surface | Traitement v0.3 | Limite de connaissance |
|---|---|---|
| Claude session | Carte « Current session » / « Session en cours/actuelle », pourcentage utilisé/restant | DOM authentifié à valider |
| Claude semaine | Carte « All models » / « Tous les modèles » | Même limite |
| Claude Sonnet/Opus | Lecture seulement si carte correspondante explicite | Autres modèles/libellés non reconnus restent absents |
| Codex / Work | Session, semaine ; Work partage l’usage Codex selon la doc | Les quotas applicables dépendent de l’offre ; aucune fenêtre inventée |
| Codex code review | Carte explicite séparée si exposée | Ne représente pas toute revue locale ; DOM à valider |
| ChatGPT Thinking / mode Pro | Indisponible automatiquement ; Thinking manuel conservé de la v0.2 | Aucun compteur fiable/autorisé intégré ; pas de plafond universel supposé |
| Conversation ChatGPT ordinaire | Pas de comptage de messages ni tokenisation | Ne signifie ni quota nul ni illimité |
| Usage API à clé | Hors périmètre | Distinct des limites d’abonnement ; pas de demande de clé |

## Approches étudiées

1. **API officielle dédiée à la consommation d’abonnement** : préférable, mais aucun contrat d’API utilisable n’a pu être établi à partir des documents consultés. Il serait faux de déclarer qu’aucune API n’existe ; cette livraison n’en intègre pas.
2. **Endpoints internes ou interception des requêtes** : non retenus. Pas de contrat public vérifié, changements possibles, risques d’accès aux données d’authentification ou de conversation.
3. **Analyse de toute conversation** : rejetée. Le nombre de messages et les tokens estimés ne donnent pas un quota d’abonnement fiable et augmentent l’accès aux données privées.
4. **Onglet officiel dédié + lecture ciblée** : implémenté. Les cartes affichées sont relues périodiquement et la page est rechargée toutes les 5 min en arrière-plan. Le consentement d’activation est explicite dans la popup. C’est moins transparent qu’une API, mais ne nécessite aucun accès privé supplémentaire ni ouverture répétée des paramètres par l’utilisateur.
5. **Saisie manuelle** : conservée en secours, clairement étiquetée, exclue du calcul de cadence.

La lecture ne tente pas de résoudre les dates locales ambiguës (« vendredi à 18 h » sans date/fuseau) : seul un timestamp explicite ou une durée « resets in… / réinitialisation dans… » est exploité. Le reset relatif porte le symbole ≈. Aucune mise à zéro automatique n’a lieu quand un reset passe : une nouvelle observation est requise.

## Prochaines priorités

1. Vérifier les cartes réelles sur tes comptes Claude et ChatGPT/Codex, puis ajuster les lecteurs avec fixtures anonymisées limitées aux cartes de quota.
2. Compiler et tester la base Safari sur Mac, iPhone et iPad ; mesurer la suspension et adapter le rythme sans promettre un service permanent.
3. Tester installation/mise à jour sur Chrome et Edge macOS/Windows, notifications système réelles et restauration des onglets.
4. Étudier une source officielle plus directe si elle devient accessible et documentée. Éviter de convertir une réponse interne non vérifiée en dépendance centrale.
5. Renforcer l’isolation des comptes/espaces sans stocker d’identifiant sensible avant d’envisager une distribution publique.

## 0.6.4 — Connexion officielle et vérification distincte

L'action **Ouvrir** ne fait qu'ouvrir ou activer un onglet officiel Claude / ChatGPT. Les mots de passe, codes de connexion et cookies restent gérés par le site et Safari. AI Flow ne demande aucun secret à l'utilisateur.

L'action **Vérifier** déclenche la collecte explicitement demandée. Une URL ouverte n'est **jamais** considérée comme preuve de connexion. Le statut « Quotas observés récemment » n'apparaît qu'après la récupération d'au moins une mesure automatique valide et encore fraîche. Une saisie manuelle ne suffit pas.

Les quotas de ChatGPT affichés automatiquement concernent uniquement Codex/Work lorsqu'une source exploitable est présente. Il n'existe pas de promesse de pourcentage global des conversations ChatGPT. En cas de refus d'accès, la valeur reste « Indisponible ». Les méthodes expérimentales peuvent être incompatibles avec certains comptes et navigateurs. Le parcours de connexion ne résout pas à lui seul les erreurs HTTP 403.
