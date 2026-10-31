# Confidentialité et permissions

AI Flow n’a ni serveur, télémétrie, paiement, compte propre, dépendance distante ni script distant. Les scripts de production ne contiennent ni fetch, XMLHttpRequest, WebSocket, API cookies, intercepteur webRequest, lecture de localStorage du site ni lecture automatique de conversation.

Le navigateur charge les pages officielles avec sa session habituelle. AI Flow ne lit pas les cookies ou jetons, ne les transmet pas et n’automatise pas l’authentification. Les sites reçoivent les visites/actualisations normales de leur page d’utilisation. L’extension ne contourne aucun écran de connexion ou contrôle d’accès.

Données enregistrées dans storage.local : identifiant technique d’un quota connu, pourcentage, provenance (observé/manuel), heure de lecture, reset éventuel, approximation du reset, historique borné (300 points par quota, jusqu’à 14 jours), paramètres, position du widget, état du connecteur, ID des onglets de suivi et métadonnées de déduplication des alertes. Aucun texte brut de page ni identifiant de compte n’est conservé. Les prévisions ne regardent que les deux dernières heures.

Permissions :

- `storage` : persistance locale.
- `alarms` : réveil périodique du background tant que le navigateur le permet.
- Accès aux trois origines ChatGPT/ancien ChatGPT/Claude : injection du widget, lecture des cartes sur deux chemins de paramètres stricts, vérification de l’URL des onglets appartenant au suivi. Aucune permission `tabs` générale ou `<all_urls>`.
- `notifications` : permission optionnelle demandée lors de l’activation par l’utilisateur, supprimée lors de sa désactivation. Non présente dans le package Safari.

Toutes les écritures passent par le background, avec validation de l’origine, du frame, du type d’action, du fournisseur et du format. Une page de conversation ne peut pas enregistrer un quota observé. Les lectures incertaines ou ambiguës sont refusées. L’historique des saisies manuelles n’est jamais utilisé pour annoncer une cadence mesurée.

Ce modèle ne protège pas contre un navigateur compromis ou une page officielle compromise. Les valeurs DOM sont celles affichées par le site ; elles ne constituent pas une attestation de facturation. Une API officielle de quota serait préférable si elle devient disponible et adaptée à un usage local sans secrets saisis dans l’extension.

La suppression des données arrête les onglets gérés et efface relevés, historique, état des connecteurs et alertes. Les préférences et la position sont conservées. Une page d’utilisation ouverte manuellement peut ensuite produire un nouveau relevé ; pour empêcher toute collecte, désactiver ou désinstaller l’extension. La désinstallation retire son stockage local selon le navigateur.

## Transfert volontaire (v0.5)
Le clic « Transférer » lit uniquement la sélection actuelle. Le texte sélectionné ou collé reste dans un champ éditable en mémoire, jamais dans storage.local, les messages au background, un journal ou le pont Mac. Le texte n’est ni résumé par un serveur, ni envoyé automatiquement à une IA. L’utilisateur vérifie, consent, copie, ouvre la destination, colle et envoie lui-même. Fermer le panneau efface son brouillon, pas le presse-papiers système (qui peut être synchronisé par iCloud ou le système). Pas d’historique complet, de pièces jointes ou d’instructions privées importées.

## Menu Mac
Seule la variante Safari macOS déclare nativeMessaging. L’option est désactivée par défaut. Quand activée, des instantanés de quotas et dates sont envoyés au composant natif Apple puis enregistrés dans un fichier du groupe local partagé entre application et extension. Les conversations et identifiants n’y figurent pas. Le menu n’effectue aucun appel réseau. Un export JSON volontaire permet l’import ponctuel depuis les autres navigateurs. Ces fichiers exportés restent à supprimer par l’utilisateur ; l’import est en mémoire. Une seule session/profil Safari doit activer le partage pour éviter de mélanger les comptes.
La désactivation du pont et la suppression des relevés tentent d’effacer la copie Mac. Si le pont est indisponible, utiliser l’effacement dans le menu Mac. La désinstallation de l’extension n’efface pas nécessairement les exports ni les données de l’application Mac.

### Parcours de connexion (0.6.4)

Les boutons « Ouvrir » affichent uniquement les pages officielles `https://claude.ai/` et `https://chatgpt.com/` dans le navigateur ; aucun identifiant n'est saisi dans AI Flow. L'indicateur « Site ouvert » ne signifie pas « authentifié ». La commande de vérification n'enregistre que les mesures numériques valides et les statuts techniques déjà prévus par les connecteurs. Aucun cookie, mot de passe, jeton ou contenu de conversation n'est enregistré par ce parcours.
