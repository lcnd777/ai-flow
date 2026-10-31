## Validation spécifique V0.6.3

Tests ciblés sur des réponses synthétiques : Claude API 403 puis lecture dans un onglet Claude connecté, délais de chargement après ouverture d’onglet, détection de redirection, sélection prudente d’organisation, lecture Codex depuis une session ChatGPT connectée sans retour du jeton, gestion des valeurs 0 %, rejet des fenêtres de quota inconnues. Aucun test avec la session authentifiée d’un utilisateur sur Safari Mac n’a été possible dans cet environnement.

# Validation de la v0.5

Ce document distingue ce qui a été exécuté des validations restantes. Les mesures et pages utilisées dans les tests sont **synthétiques**, jamais des relevés d’un compte utilisateur.

## Exécuté dans cet environnement Linux

Résultat final : **48 tests unitaires/DOM/background passants**, plus **34 vérifications d’interface** dans le navigateur de test, zéro erreur JavaScript observée. Dépendances de développement installées avec `npm ci` à partir du lockfile.

- Tests unitaires du cœur : vieillissement, source manuelle exclue des prévisions, trois points minimum, réserve/reset, cadence et fiabilité, valeurs invalides, migration, historique et paramètres.
- Tests du background avec API WebExtension simulée : concurrence multi-contextes, origine des messages, action/fournisseur autorisés, cycle d’onglet dédié et alertes dédupliquées.
- Tests DOM sur fixtures françaises/anglaises : cartes Claude/Codex, pourcentages restants, reset explicite/relatif, double carte, ambiguïtés, éléments cachés et refus des chemins conversation.
- Tests d’interface dans **Chromium Headless 133.0.6943.0** avec API WebExtension simulée : chargement popup/options, saisie, réglages, widget, valeurs observées, Smart Switch, déplacement, fermeture clavier, thème clair et largeur 320 px, navigation SPA, refus de renouveler un relevé sur DOM inchangé, reprise pageshow après 16 min simulées. Aucun compte connecté.
- Inspection visuelle initiale v0.3 sur captures synthétiques ; v0.4 vérifiée par assertions DOM et dimensions.
- Analyse des permissions, absence de réseau programmatique/cookies/lecture de conversations dans le code de production.
- Vérification syntaxique JavaScript et création des variantes/archives.

Le lecteur DOM a été mesuré sur une petite fixture synthétique (100 lectures) : environ **0,09 à 1,76 ms par lecture** selon les exécutions, après filtrage des éléments invisibles dans cet environnement. Ce n’est pas une mesure sur l’interface réelle complète. La production limite le balayage aux pages d’utilisation, à 3 000 candidats, avec un intervalle d’au moins 30 secondes pour les mutations.

## Tenté mais bloqué

- Chargement MV3 dans Chrome for Testing complet 133.0.6943.141 : le processus s’arrête avant chargement avec `socket() failed: Operation not permitted` dans la gestion du profil. Aucun test d’installation ne peut être déclaré réussi.
- Le moteur Chromium Headless alternatif exécute les interfaces, mais ne charge pas les extensions de cette façon. Ses tests utilisent donc explicitement une API simulée.
- Accès aux centres d’aide Claude/OpenAI : erreurs de recherche et HTTP 403. Documentation Codex et Apple accessible séparément, voir QUOTAS/INSTALLATION.

## Non testé / pas certifié

| Élément | Statut |
|---|---|
| Installation réelle Chrome / Edge | À faire sur navigateur complet |
| Session authentifiée Claude / ChatGPT/Codex | À faire ; connecteurs expérimentaux |
| Notifications OS | Logique testée, affichage système non testé |
| Actualisations réelles réseau et cache des fournisseurs | À faire |
| macOS / Windows | À faire |
| Safari Mac / iPhone / iPad | Source préparée, non compilée et non testée |
| Application hôte/signature Apple/TestFlight/App Store | Non produite ; packager web App Store Connect ou Xcode, compte Apple approprié |
| Résistance aux changements futurs du DOM | Refus conservateur testé, aucune garantie universelle |
| Plusieurs comptes/espaces | Non pris en charge automatiquement ; effacement requis au changement |

La suite `npm run test:extension` est fournie pour la validation d’installation MV3 sur une machine compatible. Elle utilise encore des pages synthétiques, et ne remplace pas la recette connectée décrite dans INSTALLATION.md.

## Revue indépendante et correctifs

Une revue indépendante a identifié deux défauts importants, corrigés avec tests de régression d’abord en échec puis passants :

- Préserver l’échéance de l’alarme existante lorsque le service worker se réveille, au lieu de repousser la prochaine actualisation.
- Ignorer les textes masqués des resets et refuser les dates/durées contradictoires, y compris dans une carte imbriquée.

Un test complémentaire couvre la normalisation des apostrophes dans le libellé français Codex. La suite finale est verte. Les limites externes (comptes réels, installation Chrome/Edge, notifications OS, Safari et comptes multiples) restent ouvertes ; elles n’ont pas été transformées en succès par la revue.

Revue v0.4 : déduplication corrigée par quota et conservée pendant les navigations SPA. Une limite déjà épuisée passe avant une saturation prédite. Deux régressions reproduites avant correction ; reprise mobile simulée, sans validation iOS réelle.

## v0.5 — transfert et menu Mac
- Tests JS : validation taille/vide/destination, texte non interprété comme HTML, instantané de quotas limité aux champs autorisés, opt-in du pont natif, effacement à la désactivation, échec natif sans perte de relevés, absence de liaison dans les variantes standard.
- Navigateur Chromium sur fixtures/API simulées : sélection explicite du widget, absence de texte dans le stockage, fermeture du brouillon, consentement, modification de destination, copie simulée réussie/refusée, largeur 320 px. Ce test ne certifie pas le presse-papiers Safari réel.
- Revue statique des sources Swift : correction de l’effacement du fichier partagé même pendant l’affichage d’un import manuel.
- **SwiftUI, compilation Swift, nativeMessaging Apple, App Group, signature et menu macOS : non exécutés ici.** Aucun outil Swift ni SDK Apple disponible dans cet environnement Linux.
- Les scripts de build fournissent une variante Mac native séparée. Le ZIP Apple standard ne contient pas la permission nativeMessaging ni l’application SwiftUI.
