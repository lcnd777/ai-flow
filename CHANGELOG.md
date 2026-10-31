## 0.6.4 — Connexion officielle et état de quota vérifié

- Deux entrées "Ouvrir" vers les sites officiels Claude / ChatGPT, réutilisation d’un onglet existant sans le désépingler.
- Bouton explicite "Vérifier" pour déclencher la collecte; pas de collecte automatique à la simple ouverture d’un compte.
- Trois états distincts : site ouvert, connexion à effectuer / confirmer, quota réellement observé. Aucun affichage de "connecté" fondé uniquement sur une URL ouverte.
- Aucune demande de mot de passe, aucun stockage de cookies ou de jetons. Les relevés existants et la petite fenêtre Safari restent inchangés.
- La fiabilité des endpoints de quotas doit encore être validée sur Safari authentifié et ne dépend pas de cette interface.

## 0.6.3 — Lecture Claude en contexte de page
- Nouvelle tentative depuis un onglet Claude connecté, en exécution `MAIN`, avant la requête d'arrière-plan ; aucune interception des conversations.
- Diagnostic du canal « lecture depuis l'onglet » et des redirections vers l'accueil de Claude.
- Popup compacte et onglets de suivi non épinglés conservés à l'identique.
- Permission `scripting` ajoutée : elle sert exclusivement à lire les quotas Claude après activation.
- Nouveau lecteur Codex/Work dans un onglet ChatGPT connecté ; le jeton de session reste dans cet onglet, non conservé.
- Non testé sur session Safari réelle ; impossible de garantir une API privée sans validation.

## 0.6.2 — Safari : fenêtres de suivi normales et secours Claude

- Restaure le pop-up Safari de 400 x 560 px, le grand tableau de bord reste accessible manuellement.
- Ne crée plus d’onglets épinglés pour le suivi Codex. Réutilise les onglets déjà ouverts et désépingle les anciens onglets pris en charge.
- Si l’API Claude est refusée (401/403, etc.) après activation, utilise la page officielle Claude comme solution de secours, dans un onglet non épinglé.
- Messages de diagnostic séparés pour la lecture de la page officielle et le refus de l’API.
- Aucun accès aux textes de conversations, aucune valeur inventée. Validation avec un vrai compte Safari encore nécessaire.

# 0.6.1 — Safari full-tab (annulé pour Safari en 0.6.2)

- L'action de la barre d'outils ouvre directement un onglet complet sur Safari Mac/iOS, au lieu d'une fenêtre 400×560.
- Réutilisation du tableau de bord existant lorsque possible.
- Interface pleine page jusqu'à 1080 px et suppression de l'action redondante « Ouvrir en grand » dans cet affichage.
- Aucun changement du moteur de quotas Claude ni des données locales.

## 0.6.0 — Prototype Claude API (expérimental, non validé sur Safari connecté)

- Collecte des quotas Claude par requêtes GET authentifiées, à activation explicite, sans onglet épinglé.
- Diagnostic d'échec avec code HTTP / type d'erreur.
- Validation stricte des pourcentages, 0 % correct, null ≠ 0 %, limites spécifiques et reset.
- Protection anti-mélange de comptes ; les comptes à organisations multiples sont refusés si l'organisation est ambiguë.
- Conservation de la lecture DOM comme secours et de Codex par onglet.
- Aucun suivi des conversations ou d'informations d'identité.

# 0.5.0 — transfert volontaire et compagnon Mac

- Transfert du texte sélectionné ou collé, aperçu éditable, consentement et copie. Aucun envoi automatique ou stockage de conversations.
- Gestion du refus de presse-papiers, limite de 100 000 caractères sans troncature silencieuse, remise à zéro du consentement après modification.
- Sources SwiftUI macOS 13+ : jauges, resets, vieillissement, raccourcis et import JSON ponctuel.
- Pont Safari macOS local optionnel, distinct du package iPhone, instantané strict de quotas et statut de liaison.
- Le code natif est livré non compilé/non testé : Mac, Xcode et signature nécessaires pour la liaison automatique.

# 0.4.0 — préparation au test iPhone

- Guide intégré Safari iPhone/iPad, permissions limitées et vérification du widget.
- Reprise sur pageshow/visibilitychange : état local relu et valeurs anciennes signalées.
- Une page inchangée ne renouvelle plus artificiellement les dates de relevés. Un rechargement officiel permet un nouveau relevé, même à pourcentage égal.
- Diagnostic connexion requise si un champ mot de passe visible est présent sur une page usage ; aucun contenu de champ n’est lu. Les redirections de connexion externes restent non diagnostiquées.
- Prévisions par plateforme : quotas session/semaine et modèles présents ; risque connu prioritaire, données manquantes signalées. Thinking reste indépendant de Codex.
- Génération reproductible du ZIP Apple à manifeste racine ; documentation du packager web sans Mac.

# Changelog

## 0.3.0 — 30 octobre 2026

### Ajouts
- Suivi facultatif via onglets officiels dédiés, actualisés en arrière-plan ; arrêt explicite et arrêt à la fermeture/navigation.
- Adaptateurs DOM séparés et limités aux pages d’utilisation Claude et Codex, lectures par modèle si exposées, resets non ambigus et inversion « restant → utilisé ».
- Statuts des connecteurs, source et âge des relevés, Smart Switch depuis le widget en cas d’alerte.
- Thème clair, adaptation à 320 px, maintien du widget dans le viewport et interactions clavier/tactiles.
- Base Safari générée à partir du code commun, background non persistant, script de packaging macOS/iOS/iPadOS.
- Tests unitaires, DOM, background et interface navigateur, instructions de validation réelle.

### Corrections
- Écritures centralisées : des pages différentes ne peuvent plus écraser leurs enregistrements respectifs.
- Réduction de la fraîcheur automatique de plusieurs heures à 15 minutes.
- Historique séparé des saisies manuelles ; invalidation lors d’un recul du quota, changement de reset ou source.
- Trois relevés / quinze minutes minimum pour une prévision, fiabilité affichée, réserve avant reset et aucune promesse au-delà du reset.
- Une seule notification pour le seuil le plus haut, stockage de la déduplication et permission notifications facultative.
- Conservation des alarmes entre réveils du background ; refus des resets masqués ou contradictoires.
- Une donnée manquante ne devient pas zéro ; les dates/heures ambiguës ne sont pas interprétées silencieusement.

### Conservé de la 0.2
- Widget à Shadow DOM fermé, tableau de bord, saisie manuelle, paramètres, jauges, seuils, liens de continuité, stockage local et icônes.
- Clé de stockage v0.1/v0.2 pour préserver les réglages et valeurs lors d’une mise à jour dans le même dossier d’extension. L’ancien historique sans provenance est écarté des prévisions.

### Non livré comme opérationnel
- Extraction vérifiée sur comptes réels, quotas Thinking/mode Pro automatiques, suivi garanti en arrière-plan sur iOS.
- Application Apple compilée/signée, tests Safari/Edge/macOS/Windows physiques, transfert de contexte, barre de menus macOS.
