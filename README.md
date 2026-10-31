# AI Flow V0.6.4 — correctif ciblé des quotas

L'interface compacte et les onglets non épinglés restent inchangés.

**Claude sur Safari :** lors de l'activation explicite, AI Flow tente une lecture des seuls quotas à partir d'un onglet Claude connecté dans le contexte du site (API `scripting.executeScript`, monde `MAIN`). Cette voie est conçue pour les navigateurs qui refusent les cookies à une extension en arrière-plan. Si elle ne fonctionne pas, l'ancienne lecture API puis le relevé visuel de la page officielle sont conservés. Les seules valeurs renvoyées depuis l'onglet sont des compteurs, des dates de reset et l'identifiant technique de l'organisation utilisé localement pour éviter le mélange de comptes. Aucun cookie, prompt ou contenu de conversation n'est enregistré.

**Diagnostic :** indique désormais l'échec éventuel de la lecture dans l'onglet, en complément du HTTP 403 du background. Lorsqu'une page officielle redirige vers Claude Chat, AI Flow le signale au lieu de rester perpétuellement « en attente ».

**Non garanti :** la lecture en contexte de page dépend des permissions Safari, de la disponibilité de `scripting.executeScript` et de l'API privée de Claude, qui peut changer. Cette version reste expérimentale et nécessite la validation sur Safari Mac. L'extension ne fabrique aucun pourcentage.

**ChatGPT / Codex :** en activant le suivi Codex, AI Flow lit la session ChatGPT dans l'onglet courant puis demande son usage Work/Codex. Le jeton de session est utilisé **uniquement en mémoire dans cet onglet** pour la requête de lecture vers `chatgpt.com`, sans retour vers l'extension ; seuls les pourcentages et dates (5 h / 7 jours quand explicitement disponibles) sont remontés. Si aucune donnée correspondante n'existe, le compteur reste indisponible. **Ce ne sont pas les quotas de messages ChatGPT classiques.**

Les API Claude et Codex sont privées / non documentées et peuvent changer. Les autorisations Safari et la prise en charge du monde `MAIN` doivent encore être vérifiées sur un Mac réel.

# AI Flow V0.6.2 · Safari : pop-up compact et onglets de suivi normaux

**Correction de l’ergonomie Safari Mac :** cliquer sur l’icône AI Flow conserve le pop-up compact de 400×560 px. Les onglets officiels nécessaires au suivi Claude et Codex ne sont plus épinglés (donc ne sont plus réduits à une petite icône). Un tableau de bord large reste disponible via le bouton facultatif « Ouvrir en grand ».

**Claude dans Safari :** si les requêtes authentifiées à l’API interne échouent avec HTTP 401/403, AI Flow réutilise la page officielle Utilisation de Claude quand elle est déjà ouverte, sinon ouvre un onglet Safari normal. Le lecteur de page tente de relever les quotas explicitement affichés, notamment 0 %. Les données absentes restent indisponibles. Cette collecte est expérimentale et doit être testée avec un compte réel.

**Installation :** décompresser le ZIP, Safari > Réglages > Développement, retirer l'ancienne extension temporaire, choisir le dossier `safari` de la nouvelle archive. Autoriser les sites nécessaires, recharger Claude/ChatGPT, cliquer sur l'icône AI Flow. Le widget reste disponible dans les pages.

**Limites :** la validation de l'ouverture d'onglet a été effectuée en tests simulés, pas sur un vrai Safari connecté ; la lecture Claude reste expérimentale.

---

# AI Flow 0.6.0 — Connecteur Claude expérimental

- Activation manuelle : le connecteur Claude utilise deux lectures **GET** authentifiées vers `https://claude.ai` uniquement. Il ne lit ni ne stocke les cookies, tokens, noms d'organisations, réponses de chat ni contenu de conversation.
- Lecture **non officielle** via les endpoints web de Claude ; elle peut échouer après une mise à jour de Claude ou sur Safari si le navigateur bloque les cookies depuis une extension.
- Affichage de diagnostic local (étape, code HTTP, résultat sans données sensibles).
- La lecture de page officielle existe toujours en secours lorsque l'utilisateur la visite, et Codex conserve son suivi par onglet.
- Les quotas ChatGPT des conversations ordinaires ne sont toujours pas connus précisément par AI Flow.

# AI Flow V0.5.2 · Correctif Safari Mac

- L'extension affiche maintenant un bouton **Ouvrir le tableau de bord en grand** et une action **Activer le suivi Claude**, visibles sans descendre tout en bas du pop-up.
- Lecture DOM Claude étendue aux étiquettes et jauges placées dans des `div` et lignes imbriquées (comme sur la capture française). Le lecteur reste limité à `/settings/usage`, sans cookies ni appels réseau et refuse les chiffres ambigus.
- Le 0 % officiel est traité comme une valeur valable, pas une absence de données.
- Les compteurs ChatGPT classiques (messages, Thinking, Pro) ne sont **pas disponibles automatiquement** dans cette version. Codex/Work uniquement si leur page officielle affiche des quotas reconnus.
- L'extraction réelle sur le compte Claude du Mac doit encore être validée. Safari peut exiger l'autorisation permanente d'accès à claude.ai puis un rechargement de la page.

**Installation :** Décompresser le ZIP, dans Safari > Réglages > Développement supprimer l'ancienne extension temporaire puis Ajouter une extension temporaire et choisir le dossier `safari`. Autoriser AI Flow sur claude.ai et chatgpt.com, puis recharger la page officielle d'utilisation. Dans l'extension cliquer Activer le suivi Claude et, si nécessaire, Ouvrir en grand.

# AI Flow — Usage Monitor 0.5 bêta

**Never lose your flow to an AI limit.**

Cette version poursuit le ZIP **0.2 fourni**, sans repartir de zéro. Elle livre du code exécutable, des tests et deux variantes WebExtension. Elle ne prétend pas être validée sur les comptes réels ChatGPT/Claude ou sur les appareils Apple.

## Démarrage rapide

**Chrome / Edge** : décompresse `AI-Flow-v0.5-chrome-edge.zip`, ouvre `chrome://extensions` ou `edge://extensions`, active le mode développeur, choisis **Charger l’extension non empaquetée** et sélectionne le dossier `chrome-edge` contenant `manifest.json`. Recharge les pages ChatGPT/Claude déjà ouvertes.

Ouvre AI Flow dans la barre d’extensions, puis **Activer · ouvre un onglet** pour Claude ou Codex. Cela crée un onglet officiel de suivi. Connecte-toi directement au site si nécessaire ; AI Flow ne te demande aucun identifiant. Garde cet onglet ouvert. Il est actualisé toutes les cinq minutes lorsqu’il est inactif et le navigateur éveillé. Tu peux continuer à travailler dans un autre onglet. Le fermer arrête le suivi ; **Arrêter** le ferme uniquement s’il est toujours sur sa page d’utilisation. Après redémarrage du navigateur, réactive le suivi et ferme si nécessaire les anciens onglets restaurés.

**Safari** : utilise `AI-Flow-v0.5-safari.zip`. C’est une base WebExtension avec script de génération Apple, pas une application signée ni un IPA. Le ZIP `AI-Flow-v0.5-Apple-Upload.zip` se téléverse directement dans Safari Web Extension Packager sur App Store Connect, sans Mac, avec un compte Apple Developer actif. Xcode sur Mac reste une autre voie. Voir [installation](docs/INSTALLATION.md).

## Ce qui est développé

- Widget permanent, déplaçable, réductible, thèmes clair/sombre, largeur mobile et fermeture clavier.
- Lecteur DOM strict sur `claude.ai/settings/usage` : session, semaine, Sonnet/Opus quand les cartes sont reconnues.
- Lecteur DOM expérimental sur `chatgpt.com/codex/settings/usage` : session, semaine et code review quand exposés. Work partage l’usage Codex selon la documentation OpenAI consultée ; aucune jauge indépendante Work n’est fabriquée.
- Pourcentages utilisés/restants, resets relatifs ou horodatages explicites. Les dates ambiguës restent inconnues.
- Suivi via onglet dédié ; état des connecteurs et bouton d’actualisation.
- Flow Guardian, seuils 80/95 %, alertes système facultatives sur Chromium, dédoublonnage.
- AI Runway et Session Planner par plateforme, réserve et fiabilité explicite. Au moins trois observations automatiques sur quinze minutes, même fenêtre, consommation en hausse. Une saisie manuelle n’entraîne pas le moteur.
- Smart Switch et transfert volontaire : texte sélectionné/collé, aperçu éditable, consentement, copie puis ouverture de destination. Collage/envoi manuels ; aucune migration native de l’historique ou des pièces jointes.
- Barre de menus macOS 13+ : sources SwiftUI, liaison Safari locale facultative et import JSON de secours. Non compilée ni validée sur Mac ici. Voir `macos/README.md`.
- Un seul processus écrit les données pour éviter les écrasements entre onglets ; migration des réglages et relevés v0.2.

## Limites à connaître

1. **Connecteurs expérimentaux, validés sur fixtures synthétiques uniquement.** Le DOM actuel des sites connectés n’a pas été accessible ici. Une structure différente affiche « indisponible » ; aucune consommation n’est inventée.
2. Le suivi nécessite un onglet officiel ouvert. Il n’est pas un service serveur et ne fonctionne pas navigateur fermé. Les réglages visibles peuvent eux-mêmes être retardés par le fournisseur.
3. Safari iOS/iPadOS peut suspendre l’onglet ou le background. Une actualisation toutes les cinq minutes n’est pas garantie. Le widget fonctionne seulement sur les sites dans Safari, pas dans les apps natives ChatGPT/Claude.
4. Thinking et le mode Pro de ChatGPT n’ont pas de compteur automatique fiable intégré. Une limite absente ne signifie ni « 0 % » ni « illimité ». Les plafonds d’abonnement ne sont jamais codés en dur.
5. Une observation est une valeur affichée sur le site, pas une vérité de facturation certifiée. Elle devient périmée après quinze minutes ou après reset. Les saisies manuelles sont séparées et expirent au plus tard après 5 h (session Claude) / 24 h (autres).
6. Les prévisions combinent session et semaine, ainsi que les quotas de modèle présents, au rythme récent : elles ne garantissent pas une session complète, particulièrement au-delà d’un reset. Une limite absente empêche de confirmer la capacité globale.
7. Utilise un seul compte/espace par profil de navigateur. Après changement de compte ou d’espace, efface les relevés : l’extension ne collecte pas d’identifiant de compte et ne peut pas attribuer automatiquement les anciennes valeurs. Aucun cumul inter-appareil.

## Validation et code

Voir le [bilan factuel des tests](docs/VALIDATION.md), la [recherche de quotas](docs/QUOTAS.md), la [confidentialité](docs/PRIVACY.md) et le [changelog](CHANGELOG.md).

Sources : JavaScript natif, aucune dépendance de production. Node ≥ 20 et Python 3 pour reconstruire les archives. Les dépendances npm sont réservées aux tests.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:extension
npm run build
```

Les tests d’extension utilisent des pages synthétiques servies à la place des sites officiels et un profil temporaire vide : ils ne connectent aucun compte. `CHROMIUM_PATH` permet de choisir un exécutable Chrome/Chromium local de test. Le rapport fourni précise les tests effectivement exécutés ici et les blocages.
