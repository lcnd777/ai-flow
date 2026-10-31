# Validation de la 0.8.1

## Tests exécutés

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires et non-régression (Node 22, sans dépendance) | `npm test` | **40 / 40** |
| Intégration navigateur : extension Chrome/Edge réelle dans Chromium 1.63 (Playwright), sites **simulés** | `xvfb-run -a node tests/e2e/run.cjs` | **41 / 41** |

### Ce que couvrent les tests unitaires
- **Cœur** : nettoyage de l'état (refus des valeurs non observées, hors bornes ou d'une autre plateforme), fraîcheur de 15 min, statuts « non mesuré », « partiel » et « limite atteinte ».
- **Autonomie estimée** : pas d'estimation sans données suffisantes, fourchette, cas « au-delà du reset ».
- **Smart Switch** : ne recommande ni une plateforme inconnue, ni une plateforme non mesurée, ni la plateforme courante.
- **Historique** : échantillonnage, reset constaté, périodes de limite, purge à 7 jours, trous.
- **Notifications** : une alerte par période, reset uniquement après un nouveau relevé, chaque type désactivable, regroupement par plateforme.
- **Lecteurs Claude, Codex et Grok** exécutés sur leur vrai code avec un `fetch` simulé : formats, 0 % accepté, valeurs nulles refusées, 401/403, organisations ambiguës, mauvais domaine, aucun jeton renvoyé, fenêtres Codex inconnues refusées, réponse Grok incohérente refusée.
- **Background dans un faux navigateur** :
  - un site ne peut ni effacer ni changer les réglages ;
  - Paramètres et Tableau de bord s'ouvrent dans un onglet normal, non épinglé et réutilisé ;
  - aucun onglet n'est ouvert ni rechargé par l'actualisation ;
  - changement de compte et déconnexion effacent les relevés ;
  - les notifications ne se répètent pas ;
  - Awake : désactivé par défaut, limité à 12 h, arrêté après annulation, l'app jamais sollicitée si Awake est désactivé, indisponible hors Safari.

### Ce que couvre le test d'intégration (Chromium)
- Lecture automatique sans clic depuis des onglets ouverts (Claude, Codex, Grok), aucun jeton dans le stockage.
- Popup et pastille affichent les mêmes valeurs. ChatGPT et Codex sont distincts, Gemini apparaît « Non mesuré ».
- Paramètres, Tableau de bord et Transférer s'ouvrent depuis le popup dans de vrais onglets non épinglés, sans doublon.
- Paramètres : masquer, réordonner, types de notification, Awake, rendu sans débordement à 390 px.
- Smart Switch, autonomie estimée et historique tracé.
- Limite atteinte : la carte de relance s'ouvre, la relance est programmée à la réouverture + 2 min, envoyée une seule fois (vrai `executeScript`) et son résultat est enregistré, puis la notification « de nouveau disponible » arrive.
- Transfert depuis la pastille avec la sélection, aperçu structuré et modifiable, reprise enregistrée et visible dans le popup.

## Ce qui n'a PAS pu être vérifié ici
- **Safari** (Mac, iPhone, iPad) : aucun Safari n'est disponible dans l'environnement de développement (Linux). Le code utilise les mêmes API que la 0.7, déjà validée par l'utilisateur sur Safari Mac pour la lecture Claude et Codex, mais la 0.8 doit être testée sur Safari.
- **Comptes réels** : toutes les réponses des plateformes ont été simulées. **Grok n'a jamais été lu sur un compte réel** (hôte inaccessible depuis l'environnement).
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
