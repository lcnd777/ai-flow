# Validation de la 0.10.0

## Tests exécutés

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires, calculs, migrations, transfert, stockage (Node 22, sans dépendance) | `npm test` | **68 / 68** |
| Intégration navigateur : extension Chrome/Edge réelle dans Chromium (Playwright), sites **simulés** | `xvfb-run -a node tests/e2e/run.cjs` | **51 / 51** |

### Ce que couvrent les tests unitaires
- **Cœur** : nettoyage de l'état (refus des valeurs non observées, hors bornes ou d'une autre plateforme), fraîcheur de 15 min, statuts « non mesuré », « partiel » et « limite atteinte ».
- **Autonomie estimée** : pas d'estimation sans données suffisantes, fourchette, cas « au-delà du reset ».
- **Smart Switch** : ne recommande ni une plateforme inconnue, ni une plateforme non mesurée, ni la plateforme courante.
- **Historique** : échantillonnage, reset constaté, périodes de limite, purge à 7 jours, trous.
- **Notifications** : une alerte par période, reset uniquement après un nouveau relevé, chaque type désactivable, regroupement par plateforme.
- **Lecteurs Claude et Codex** exécutés sur leur vrai code avec un `fetch` simulé : formats, 0 % accepté, valeurs nulles refusées, 401/403, organisations ambiguës, mauvais domaine, aucun jeton renvoyé, fenêtres Codex inconnues refusées.
- **Background dans un faux navigateur** :
  - un site ne peut ni effacer ni changer les réglages ;
  - Paramètres et Tableau de bord s'ouvrent dans un onglet normal, non épinglé et réutilisé ;
  - aucun onglet n'est ouvert ni rechargé par l'actualisation ;
  - changement de compte et déconnexion effacent les relevés ;
  - les notifications ne se répètent pas ;
  - Awake : désactivé par défaut, limité à 12 h, arrêté après annulation, l'app jamais sollicitée si Awake est désactivé, indisponible hors Safari.

### Ce que couvre le test d'intégration (Chromium)
- Lecture automatique sans clic depuis des onglets ouverts (Claude, Codex), aucun jeton dans le stockage.
- Popup et pastille affichent les mêmes valeurs. ChatGPT et Codex sont distincts, Gemini apparaît « Non mesuré ».
- Paramètres, Tableau de bord et Transférer s'ouvrent depuis le popup dans de vrais onglets non épinglés, sans doublon.
- Paramètres : masquer, réordonner, types de notification, Awake, rendu sans débordement à 390 px.
- Smart Switch, autonomie estimée et historique tracé.
- Limite atteinte : la carte de relance s'ouvre, la relance est programmée à la réouverture + 2 min, envoyée une seule fois (vrai `executeScript`) et son résultat est enregistré, puis la notification « de nouveau disponible » arrive.
- Transfert depuis la pastille avec la sélection, aperçu structuré et modifiable, reprise enregistrée et visible dans le popup.

## Défaut trouvé sur Safari réel (0.8.1) et corrigé en 0.10.0
Sans app Mac, Safari ne répond jamais à un appel natif, ce que Chromium ne reproduit pas (l’appel y échoue immédiatement). Un test reproduit désormais ce cas : un appel natif qui ne répond jamais ne doit bloquer ni les réglages ni les ouvertures de pages.

## Ce qui n'a PAS pu être vérifié ici
- **Safari** (Mac, iPhone, iPad) : aucun Safari n'est disponible dans l'environnement de développement (Linux). Le code utilise les mêmes API que la 0.7, déjà validée par l'utilisateur sur Safari Mac pour la lecture Claude et Codex, mais la 0.8 doit être testée sur Safari.
- **Comptes réels** : toutes les réponses des plateformes ont été simulées.
- **Swift** : `native/AppDelegate.swift` et `native/SafariWebExtensionHandler.swift` n'ont **pas été compilés** (pas de Xcode). Les points à vérifier en priorité :
  1. compilation ;
  2. ouverture de `aiflow://` depuis l'extension sandboxée ;
  3. assertion visible dans `pmset -g assertions` (« AI Flow : relance de conversation programmée ») ;
  4. libération à l'échéance.
- **Sélecteurs de relance** (zone de saisie, bouton Envoyer) sur les interfaces réelles de Claude et ChatGPT.

## Vérification manuelle conseillée sur Safari Mac (10 min)
1. Ouvre Claude et ChatGPT : les chiffres apparaissent dans la pastille et le popup sans clic, avec « Actualisé à HH:MM ».
2. Dans le popup, les boutons Tableau de bord, Transférer et Paramètres ouvrent chacun un onglet normal.
3. Paramètres › Awake : active-le, clique « Tester (2 min) ». Une tasse apparaît dans la barre des menus, et `pmset -g assertions` dans le Terminal liste AI Flow.
4. Programme une relance manuelle dans 2 min depuis une conversation : le message part, puis la tasse redevient une lune.

## Ajouts 0.10.0
- `tests/runway.test.cjs` : prévisions. Couvre une consommation stable ou irrégulière, l’inactivité, un reset imminent ou passé, une consommation nulle, un historique insuffisant, des relevés périmés, des variations extrêmes, les fuseaux horaires (Paris, New York, Tokyo, en processus séparés), le cas « 14 h à 58 h » et la limite qui bloque en premier.
- `tests/history.test.cjs` : historique. Couvre l’enregistrement, la détection de reset, la distinction entre mesure directe et attribution, la consommation après un reset, la compatibilité des anciens points et la **migration sans perte**.
- `tests/transfer.test.cjs` : lecture des conversations Claude et ChatGPT (ordre, rôles, branche courante, repli page), budget du transcript, pré-remplissage, points de reprise, Flow Recovery et refus hors conversation.
- Intégration : infobulle de l’historique, transfert d’une conversation complète, insertion sans envoi dans ChatGPT, modes Awake et commande `pmset`, seuil d’alerte, Flow Recovery de bout en bout (interruption, réouverture, « Reprendre »).

**Limite du test d’intégration** : un onglet ouvert par l’extension elle-même échappe aux sites simulés. L’insertion automatique est donc vérifiée avec la même fonction sur un onglet ChatGPT simulé déjà ouvert. Sur les vrais sites, les sélecteurs de la zone de saisie restent à confirmer.

## Cycle de mise à jour validé sur le Mac de l’utilisateur (31 octobre 2026)
- Installation initiale d’AI Flow Dev (build 4, signature ad hoc), puis activation de l’extension dans Safari.
- Publication automatique du build 5 par GitHub Actions : tests, compilation macOS 15, test de lancement, signature Ed25519, appcast.
- Mise à jour via Sparkle (« Rechercher des mises à jour… » › Installer et relancer) : nouvelle version active (« 0.11.0 dev 5 »), réglages conservés.
- Problème rencontré et corrigé : avec la signature ad hoc, le runtime renforcé refusait de charger Sparkle.framework (« different Team IDs »). Le runtime renforcé n’est donc activé qu’avec Developer ID, et la CI lance l’app 10 s avant toute publication.

## Ajouts 0.12.0
- Tests : `tests/transfer.test.cjs` (continuité intelligente, pièces jointes, taille), `tests/recovery.test.cjs` (lien de destination, fusion, reprise confirmée, notification cliquable, timeline, suppression, barre de menus) : **88 / 88**.
- Intégration Chromium (sites simulés) : **57 / 57**, dont extraction automatique, pièce jointe signalée, taille estimée, suggestion de point de reprise et bouton dans la pastille.
- Compilation macOS dans le cloud : validée par la CI, avec lancement de l’app pendant 10 s.
- Non vérifié : conversations et pièces jointes des vrais sites, affichage réel de la barre de menus.

## Ajouts 0.13.0 — Smart Context Sync

- **Tests unitaires** : 109/109 (dont 20 pour Smart Context Sync : delta, doublons, modifications, captures partielles, décisions, conflits et leur résolution, trois états, secrets, journal, concurrence, échec puis nouvelle tentative, confirmation non reçue, annulation, permission refusée, conversation supprimée, suppression d’un Flow, chiffrement, absence de chiffrement, migration et données corrompues).
- **Chromium (extension réelle, sites Claude et ChatGPT SIMULÉS)** : 83/83, dont le parcours complet : transfert avec liaison → Flow créé → « Synchroniser » dans la pastille → 2 nouveaux messages, transfert initial ignoré → décision « Remplace » la proposition → exclusion d’un élément → insertion dans la conversation Claude liée sans envoi → « Insérée, à confirmer » → confirmation → « À jour » → conflit avec 4 choix, transmission bloquée puis « À arbitrer ».
- **Non vérifié ici** : aucune session Claude ou ChatGPT authentifiée n’a été utilisée ; le format réel des identifiants de messages, l’insertion dans les vraies zones de saisie et l’affichage sur Safari Mac / iPhone / iPad restent à vérifier sur ton appareil.
