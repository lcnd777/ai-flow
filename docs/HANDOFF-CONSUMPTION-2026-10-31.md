# Passation — graphique de consommation par plateforme

Demande : voir toutes les plateformes ensemble, distinguées par couleur, sans sélecteur de fenêtre 5 h / semaine.

- Branche `codex/platform-consumption-chart`, basée sur la correction Sync de la PR #1 ; PR à examiner au-dessus de cette branche pour préserver son travail.
- Graphique groupé : Claude orange `#D97757`, Codex violet `#7C8CF8`. Toutes les plateformes actuellement mesurables du registre sont présentes, même si leurs cartes sont masquées dans les réglages. ChatGPT n’a pas de quota lisible distinct : aucun chiffre inventé.
- Les pourcentages session et semaine recouvrent le même usage et ne s’additionnent pas. `platformConsumption()` choisit la session lorsqu’elle possède au moins un relevé dans la période, sinon l’hebdomadaire. Même base sur toute la période, identifiée dans le résumé et l’infobulle. Aucun total inter-plateformes, pas de conversion supposée en jetons.
- Reprise des calculs existants de consommation, resets et attribution après absence. Historique et clés de stockage inchangés. Indication de couverture dans le résumé ; absence distincte de zéro. Limite indiquée par un point rouge sans changer la couleur de la plateforme.
- Modifications : shared.js (sélection des séries), dashboard.js/html (barres groupées, résumé et infobulle), ui.css (couleurs).
- Tests : 3 régressions de calcul, d’abord en échec avant ajout du helper, et 2 tests du vrai contrôleur avec DOM minimal (couleurs, suppression du sélecteur, clavier, 7 jours, vide). Ces derniers ne simulent pas un moteur de rendu.
- Revue indépendante : pas de défaut important ; couverture ajoutée au résumé suite à une remarque. La légende d’attribution utilise encore une couleur générique avec contour pointillé.
- Limite : Chromium non disponible dans cet environnement (installation échouée au tour précédent), donc aucune validation visuelle navigateur / Safari revendiquée. À vérifier sur Safari Mac et iPhone : espacement des barres, infobulle tactile, contraste et passage 24 h / 7 jours.
- Version applicative inchangée : pas de publication automatique ni de fusion main.
