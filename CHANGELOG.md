## 0.10.0 — Continuité du travail : prévisions fiables, historique enrichi, Awake repensé, Smart Transfer 2.0

### Corrigé
- **Prévisions (AI Runway)** : le moteur extrapolait le rythme de 2 h sur des jours, sommeil compris, puis affichait une fourchette bornée par le reset. D’où le « 14 h à 58 h ». Le nouveau moteur :
  - **session (5 h)** : rythme récent seulement s’il y a assez de relevés (≥ 3 sur 20 min) et une activité récente. La fiabilité vient de la cohérence entre les deux moitiés de l’observation.
  - **semaine** : rythme moyen depuis le début de la période (nuits et pauses comprises), comparé au temps écoulé.
  - **issues explicites** : limite atteinte, reset imminent, historique insuffisant, aucune consommation récente, pas de limite avant la réinitialisation (avec marge), risque avant le reset (heure et confiance) ou risque non chiffré (prévision peu fiable). Jamais de fourchette en heures.
  - **popup et pastille** : n’affichent une prévision que si elle est utile.
- **Historique** : restauré (la 0.9.0 le supprimait à l’installation, ce qui n’arrive plus). Améliorations :
  - les hausses constatées après une absence de mesure sont distinguées (hachuré) ;
  - la consommation qui suit un reset est comptée ;
  - les axes sont plus lisibles ;
  - **infobulle** au survol, au toucher et au clavier : heure, quota, consommation, niveau relevé, nombre de relevés réels, reset, limite.
- **Awake** repensé autour du vrai besoin (une relance qui tombe la nuit) :
  - rattrapage au réveil par défaut, sans aucune action ;
  - réveil programmé du Mac (`pmset`, 2 min avant, puis il se rendort) ;
  - maintien éveillé pour une absence courte ;
  - FAQ (branché, batterie, capot fermé, relance manquée). Une relance manquée part au réveil et est signalée « rattrapée ».

### Nouveau
- **Smart Transfer 2.0** : « Transférer cette conversation » (fenêtre AI Flow ou pastille) lit **sur ton clic** la conversation Claude ou ChatGPT ouverte, dans l’ordre et par rôle. La page prépare ensuite un message de reprise :
  - objectif et prochaines actions pré-remplis, plus les derniers échanges, ou la conversation complète ;
  - taille choisie, aperçu modifiable ;
  - ouverture de la destination avec **insertion dans la zone de saisie sans envoi** (copie en secours).
- **Flow Checkpoints** : points de reprise (nom, plateforme, lien, objectif, décisions, prochaines étapes, message) à créer, modifier et supprimer. Les reprises de la 0.8 sont conservées.
- **Flow Recovery** : quand une limite interrompt une conversation, AI Flow en note le titre et le lien (sans contenu). Quand le quota est confirmé rouvert, la notification et la fenêtre proposent **« Reprendre »**.
- **Flow Timeline** (tableau de bord) : ce que tu faisais, où, sur quelle IA, et comment continuer.
- **Quota Intelligence** : la limite qui bloquera en premier (temps et rythme, pas seulement le %).
- **AI Availability Radar** : Disponible, Proche de la limite, Limite atteinte, Reset imminent, Données périmées, Indisponible.
- **Alertes personnalisables** : seuil 70, 80, 90, 95 % ou valeur libre, chaque type désactivable, sans répétition.
- **Fenêtre AI Flow** : l’IA de l’onglet actif en premier (« Tu utilises Claude »), avec ses actions de transfert et de point de reprise.

### Expérimental / à valider sur Safari réel
- Lecture des conversations (API web internes de Claude et ChatGPT, repli sur la page affichée).
- Insertion automatique dans la zone de saisie.
- Réveil programmé `pmset`.
- Rattrapage après la veille dans Safari.

### Non réalisé (limites réelles)
- **Barre de menus macOS native, raccourci global, widget macOS** : nécessitent une app compilée avec Xcode, indisponible sur ton Mac et ici (Linux). Le code Swift existant (Awake, menu) est conservé dans `native/`.
- Multi-comptes simultanés : les relevés restent isolés par compte (changement de compte = relevés effacés), sans vue côte à côte.
- Context Health, dépenses et crédits, statut des services : étudiés, non intégrés (voir docs/QUOTAS.md).
- Nouvelles plateformes : aucune n’expose de quota fiable (Gemini, Cursor, Copilot, Perplexity, Grok).

## 0.9.0 — Plus simple : Claude et Codex, relance automatique pour Codex, Awake expliqué

- **Grok retiré** (lecture expérimentale non vérifiable). AI Flow suit désormais Claude et Codex uniquement.
- **Relance automatique pour Codex**, comme pour Claude : dans une tâche Codex (chatgpt.com/codex/tasks/…), quand le quota Codex est atteint, la pastille propose « Programmer à HH:MM » à la réouverture lue automatiquement, puis vérifie que Codex est bien rouvert avant d’envoyer. Dans une conversation ChatGPT classique, dont les limites ne sont pas lisibles, l’heure reste à choisir.
- **Awake expliqué** : pourquoi (une relance ne part pas si le Mac s’endort), ce que fait la commande, et ce qui est normal (rien ne s’affiche dans Terminal).
- **Historique retiré** : il ne pouvait pas refléter ta vraie consommation heure par heure. Les relevés n’existent que lorsqu’un onglet est ouvert, et les quotas sont arrondis par la plateforme. Les données d’historique déjà enregistrées sont supprimées.
- Tests : 39 unitaires, 43 vérifications d’intégration.

## 0.8.2 — Boutons et réglages réparés sur Safari, IA non mesurables retirées, vraie consommation

### Corrigé
- **Safari : boutons et réglages sans effet.** Sans app Mac, Safari ne répondait jamais à la demande d’état d’Awake, et cette demande bloquait la file d’attente de l’arrière-plan. Tout ce qui suivait restait figé : « Actualiser » bloqué, toggles et flèches non enregistrés, boutons Ouvrir, Tableau de bord, Transférer et Paramètres inertes. Corrections :
  - les appels natifs abandonnent au bout de 3 s ;
  - une tâche bloquée libère la file après 30 s ;
  - les ouvertures d’onglets et les lectures ne passent plus par la file ;
  - toute demande échoue proprement après 12 s, avec un message ;
  - les boutons d’ouverture ouvrent l’onglet directement si l’arrière-plan ne répond pas ;
  - les pages de l’extension sont reconnues même quand Safari ne fournit pas leur URL.
- **Historique** : les hausses rapprochées (moins d’une minute) étaient écrasées, ce qui sous-estimait la consommation.

### Modifié
- **IA sans limites lisibles retirées** : Gemini, GitHub Copilot, Cursor, Perplexity, Microsoft Copilot, et ChatGPT en tant que plateforme. Restent Claude, Codex et Grok. La pastille reste sur chatgpt.com pour Codex et la relance de conversation.
- **« Historique » devient « Ma consommation »** : barres par heure (24 h) ou par jour (7 jours) de ce que tu as réellement consommé, en % du quota, avec un résumé (« 62 % de la session Claude consommés »), les limites atteintes et les heures sans mesure. L’ancien graphique montrait seulement le niveau de la jauge.

## 0.8.1 — Tout sans Xcode

- **Awake en mode Terminal** : sans l’app Mac (donc sans Xcode), AI Flow calcule la commande macOS `caffeinate -i -t <secondes>` pour la relance programmée (jusqu’à 10 min après), avec un bouton Copier dans la pastille et dans Paramètres. Elle fonctionne aussi avec Chrome et Edge sur Mac. L’état indique « Mode Terminal » au lieu de « Indisponible ».
- Installation réécrite : l’extension temporaire de Safari (sans Xcode) devient la voie principale ; Xcode reste facultatif.
- Tests : 40 unitaires, 41 vérifications d’intégration (dont le mode Terminal sur Mac simulé).

## 0.8.0 — Centre de contrôle multi-IA, Awake intégré, vraies pages Tableau de bord et Paramètres

### Développé
- **Architecture de connecteurs** (`safari/platforms.js` + `safari/readers.js`) : chaque plateforme déclare ses hôtes, limites, niveau de support (lecture auto, expérimental, non mesuré) et son lecteur isolé. Neuf plateformes : Claude, ChatGPT, Codex, Grok, Gemini, GitHub Copilot, Cursor, Perplexity, Microsoft Copilot.
- **Grok** : lecteur expérimental (requêtes restantes dans la fenêtre glissante), non vérifié sur compte réel. **Gemini, Copilot, Cursor, Perplexity, Microsoft Copilot** : suivi limité clairement indiqué « Non mesuré » (aucune donnée de quota fiable accessible), avec accès direct, Smart Switch et transfert.
- **ChatGPT et Codex séparés** : Codex est chiffré, les conversations ChatGPT sont « Non mesuré », sans mélange.
- **Autonomie estimée** (remplace « Prévoir ma session ») : intégrée aux cartes, calculée sur l'historique local avec une fourchette selon la variabilité, marquée « Estimation ». Masquée sans données suffisantes.
- **Smart Switch** : quand une IA approche de sa limite, propose uniquement les plateformes dont la capacité est confirmée par un relevé récent. Les autres sont listées à part (« État inconnu », « Non mesurées »). Présent dans le popup, le tableau de bord et la pastille.
- **Transfert de contexte structuré** : objectif, contexte, décisions, contraintes, fait, prochaines actions, extrait. Aperçu modifiable, copie puis ouverture de la destination. Depuis la pastille, la sélection est reprise (sur clic uniquement).
- **Reprises de travail** : enregistrées localement depuis le transfert, retrouvables dans le popup et le tableau de bord, rappelées dans la notification de reset.
- **Notifications** : limite proche (90 %), limite atteinte, quota de nouveau disponible (seulement après relevé confirmé). Une seule par période, chaque type désactivable. Canaux : bannière dans la pastille ; notifications système sur Chrome/Edge ; notifications macOS via l'app sur Safari Mac.
- **Historique 24 h / 7 jours** : courbe des mesures réelles, trous visibles (aucune donnée), périodes de limite, resets constatés, export JSON.
- **Personnalisation** : afficher ou masquer et réordonner les plateformes, lecture auto par plateforme, état de connexion et raison d'indisponibilité.
- **Tableau de bord** (`dashboard.html`) et **Paramètres** (`options.html`) refaits en vraies pages responsive, ouvertes dans un onglet normal (jamais épinglé, réutilisé si déjà ouvert).
- **Awake finalisé** : `native/SafariWebExtensionHandler.swift` et `native/AppDelegate.swift`, installés automatiquement par `prepare-safari.sh`. L'app Mac maintient le Mac éveillé avec une assertion IOKit jusqu'à 10 min après la relance (12 h maximum), puis libère seule. Pause sous 20 % de batterie, état dans la barre des menus, arrêt manuel, ouverture à la connexion. Désactivé par défaut, état affiché (actif, prêt, désactivé, indisponible + raison), bouton « Tester (2 min) ».
- **Chrome / Edge** : `node tools/build.mjs` produit `dist/chrome-edge` (service worker, notifications).
- **Tests** : 39 tests unitaires et de non-régression, 39 vérifications d'intégration dans Chromium.

### Corrigé
- Boutons « Paramètres » et « Tableau de bord » du popup inutilisables : ils ouvrent désormais un onglet pleine taille, et le popup se referme.
- Sur Chrome, un onglet AI Flow déjà ouvert n'était pas retrouvé (URL masquée sans permission « tabs ») : il est réutilisé grâce à `runtime.getContexts`.
- Un relevé d'un autre compte ou après déconnexion n'est plus affiché (relevés de la plateforme effacés).
- L'ancien code Awake dépendait d'un App Group fictif et n'était branché nulle part : remplacé par un lien local `aiflow://`, sans App Group.
- `prepare-safari.sh` ne s'arrête plus si le dossier existe (nouveau nom automatique) et ouvre Xcode.

### Supprimé
- Lecteur DOM des pages d'usage, double implémentation des lecteurs Claude et Codex, anciens « trackers » (pouvaient recharger des onglets), AI Runway et réserve de sécurité, export « barre de menus » jamais implémenté côté Mac.

### Fonctionnel mais à valider sur navigateur réel
- Tout le parcours sur **Safari Mac et iOS** (testé sur Chromium uniquement).
- Lecture **Grok** sur compte réel.
- Compilation et comportement de l'**app Mac** (Awake, barre des menus, notifications).
- Sélecteurs de la relance sur les interfaces réelles de Claude et ChatGPT.

### Impossible ou non vérifié
- Quotas des conversations ChatGPT, de Gemini, de Perplexity et de Microsoft Copilot : non exposés.
- GitHub Copilot et Cursor : visibles uniquement sur leurs tableaux de bord, via des interfaces non documentées. Connecteurs préparés, non activés.
- Awake ne réveille pas un Mac déjà endormi et ne fonctionne pas capot fermé sur batterie.

## 0.7.0 — Mise à jour automatique, relance après quota, fenêtre simplifiée

- Quotas mis à jour sans clic : depuis tout onglet Claude / ChatGPT ouvert (toutes les 2 min, à l’ouverture de la fenêtre, au retour sur l’onglet). Aucun onglet n’est ouvert ni rechargé automatiquement.
- La pastille relit le stockage toutes les 30 s (Safari ne transmet pas toujours `storage.onChanged`) : fin du « Indisponible » alors que la fenêtre affichait des valeurs.
- « Mes comptes » et « Suivi automatique » fusionnés : une ligne par plateforme (état, Ouvrir, interrupteur de mise à jour auto). Boutons Vérifier / Activer / Arrêter supprimés ; anciens suivis par onglet nettoyés à la mise à jour.
- Suppression de « Vérifier quotas Claude » et de la saisie manuelle de relevés.
- « Observé · il y a X min » masqué tant que la donnée a moins de 5 min ; « Mis à jour il y a X min » en orange au-delà.
- Logos Claude et ChatGPT.
- Relance programmée (désactivée par défaut, réglage « Relance après quota ») : sur Claude, carte « Quota atteint » proposant de relancer la conversation à la réouverture de la session ; sur ChatGPT, heure choisie par l’utilisateur. Un seul envoi, annulable, jamais par-dessus un brouillon. Liste des relances dans la fenêtre.
- Maintien du Mac éveillé et notification de fin via l’app Mac (`native/AIFlowKeepAwake.swift`, permission `nativeMessaging`).
- Flow Guardian clarifié : il agit sur la pastille de Claude / ChatGPT.

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
