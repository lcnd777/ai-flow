# Recette 0.15.0 — vérifications sur ton Mac (≈ 10 min)

Ce que les tests automatiques ne peuvent pas faire : vrais comptes Claude / ChatGPT et Safari réel.

1. **Mise à jour** : ⚡ › Rechercher des mises à jour… › Installer et relancer. Attendu : version 0.15.0.
2. **Claude → ChatGPT** : dans une conversation Claude, pastille › « Continuer sur ChatGPT ».
   Attendu : rubriques remplies, encadré « Ton transfert est prêt » (Transmis / Non transmis), « Ouvrir ChatGPT et insérer » insère sans envoyer.
3. **ChatGPT → Claude** : même chose depuis une conversation ChatGPT (« Continuer sur Claude »).
4. **Sauvegarder pour plus tard** : pastille › « Sauvegarder ». Attendu : élément dans la Flow Timeline (fenêtre AI Flow).
5. **Synchroniser les avancées** : lors de l’étape 2, coche « Lier ces conversations », envoie le message, avance un peu sur ChatGPT, puis pastille ChatGPT › « Synchroniser les avancées » › insérer dans Claude › envoyer › « confirmer ». Re-cliquer : « À jour ».
6. **Quota Sentinel** : ferme tous les onglets Claude 20 min. Attendu dans la fenêtre AI Flow : « Dernier relevé il y a … · ouvre Claude pour actualiser », jamais 0 %.
7. **Dev Continuity** : ⚡ › Dev Continuity… › Choisir un projet (un clone Git). Attendu : dépôt, branche, dernier commit, état ; « Préparer la reprise avec Codex » › « Copier les instructions » › coller dans Codex.
   Si Git n’est pas installé : bouton « Installer les outils Git d’Apple ».

Envoie une capture de toute étape qui ne correspond pas à l’attendu.
