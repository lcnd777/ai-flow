## V0.6.2 — Safari Mac

Le clic sur l’icône AI Flow conserve la petite fenêtre du tableau de bord (400×560 px). Les onglets de suivi Claude et Codex sont des onglets normaux **non épinglés**. L’extension temporaire doit être retirée puis rechargée depuis le nouveau dossier `safari` pour que ce comportement soit appliqué.

**Pour les quotas :** activer Claude depuis la fenêtre AI Flow. Si l’API est refusée avec HTTP 403, AI Flow tente de lire la page officielle `https://claude.ai/settings/usage` (réutilise l’onglet existant ou en ouvre un normal). Autoriser AI Flow sur `claude.ai` et recharger la page. Le statut « Lecture de page officielle réussie » est attendu uniquement si les chiffres sont réellement reconnus. Pour Codex, le suivi utilise la page officielle `https://chatgpt.com/codex/settings/usage`, sans épingler cet onglet.

**Anciennes versions :** des onglets épinglés créés par la V0.5/V0.6 peuvent rester dans Safari après la désinstallation temporaire. Les désépingler via le menu contextuel Safari si nécessaire.

# Installation et test réel

## Chrome / Edge — macOS et Windows

1. Décompresser le ZIP Chrome/Edge dans un emplacement durable.
2. Ouvrir `chrome://extensions` ou `edge://extensions` et activer le mode développeur.
3. Choisir **Charger l’extension non empaquetée**, puis le dossier `chrome-edge` où se trouve `manifest.json` (pas le ZIP ni son dossier parent).
4. Vérifier qu’aucune erreur n’apparaît, épingler AI Flow dans la barre d’extensions, ouvrir ChatGPT ou Claude.
5. Ouvrir la popup et activer le suivi pour la plateforme souhaitée. Un onglet de paramètres officiel est créé. Si une authentification est nécessaire, la réaliser sur le site lui-même.
6. Après chargement, comparer les valeurs du site avec AI Flow. Si elles ne correspondent pas, arrêter le suivi et ne pas utiliser les prévisions. L’état « structure non reconnue » est préférable à une valeur devinée.
7. Garder l’onglet ouvert et travailler dans un autre onglet. Les nouvelles lectures et le temps écoulé apparaissent dans la popup/le widget.

Le ZIP n’est pas un CRX signé ni une publication Chrome Web Store / Edge Add-ons. Les politiques de certains ordinateurs professionnels bloquent les extensions non empaquetées.

### Mettre à jour une v0.2 installée

Pour garder le même identifiant d’extension et son stockage, sauvegarder le dossier v0.2, remplacer ses fichiers par le contenu du nouveau dossier `chrome-edge`, puis cliquer **Recharger** dans la page des extensions. Recharger également les onglets ChatGPT/Claude ouverts. Charger le nouveau code depuis un autre chemin peut créer une autre extension avec un stockage séparé ; ne laisser qu’une version activée.

## Safari — macOS, iPhone et iPad

Le ZIP Safari contient `safari/` (ressources WebExtension) et `prepare-safari.sh`. Il ne contient pas de `.app` signé ni de `.ipa`.

### Depuis Safari iPhone, sans Mac

1. Télécharger `AI-Flow-v0.5-Apple-Upload.zip` dans Fichiers, sans le décompresser. Le manifeste est à la racine et seuls les fichiers de production sont inclus.
2. Ouvrir App Store Connect avec le compte Apple Developer actif. Créer la fiche AI Flow si nécessaire (identifiant de bundle unique et SKU).
3. Aller à Utilisateurs et accès → Xcode Cloud → Safari Web Extension Packager. Téléverser le ZIP, sélectionner l’application et les plateformes proposées.
4. Suivre la compilation Apple et résoudre les éventuels avertissements. Ce ZIP n’a pas encore été compilé ni accepté par Apple dans cet environnement.
5. Distribuer la compilation de test via TestFlight, l’installer sur l’iPhone, puis activer l’extension Safari et l’autoriser sur les deux sites. Consulter « Premiers pas » dans le tableau de bord.
6. Effectuer la recette ci-dessous avant toute publication publique. Un examen Apple peut être nécessaire selon le type de distribution TestFlight.

Documentation Apple : https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect

### Autre voie : Mac avec Xcode

Sur un Mac avec Xcode sélectionné :

```sh
cd /chemin/du/zip-safari-décompressé
sh prepare-safari.sh "$HOME/Desktop/AI-Flow-Apple" com.votreorganisation.aiflow
```

Le script choisit `safari-web-extension-packager`, ou son ancien nom `safari-web-extension-converter`. L’outil Apple génère le projet Xcode à partir des ressources. Il ne remplace aucun projet existant. Choisir un identifiant de bundle propre pour une distribution.

Dans Xcode :

1. Examiner les avertissements de compatibilité du manifeste émis par le packager.
2. Vérifier les cibles macOS et iOS et leur disponibilité iPad ; utiliser le packager `--rebuild-project` si une ancienne configuration n’avait qu’une cible macOS.
3. Configurer l’équipe de signature pour l’application hôte et l’extension ; choisir le Mac/simulateur/appareil cible puis compiler et lancer.
4. Sur Mac : activer AI Flow dans les réglages Extensions de Safari et autoriser les sites nécessaires.
5. Sur iPhone/iPad : installer l’application hôte depuis Xcode ou une distribution Apple appropriée ; activer l’extension dans les réglages Safari → Extensions, puis autoriser ChatGPT/Claude. Le chemin exact des réglages varie selon la version iOS.
6. Tester en premier plan puis après verrouillage, mise en arrière-plan, fermeture et restauration des onglets. Vérifier que les données vieillissent correctement ; ne pas attendre une surveillance permanente quand iOS suspend Safari.

Le manifeste Safari utilise les scripts de background non persistants au lieu du service worker Chromium. Les notifications système sont retirées de cette variante ; les alertes visuelles restent présentes. Le widget n’est injecté que dans les sites web ouverts dans Safari, jamais dans les applications natives.

**Non réalisé ici :** génération Xcode sur Mac, compilation, signature, installation physique, validation de l’épinglage des onglets et des permissions Safari. Une cible temporaire Safari sur Mac peut également être proposée par les versions récentes de Safari ; elle ne remplace pas le packaging iPhone/iPad. La voie web App Store Connect ci-dessus permet de préparer la distribution sans Mac.

Source Apple consultée le 30/10/2026 : https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari

## Recette sur compte réel

- Comparer 0 %, valeur intermédiaire et, si naturellement disponible, seuil 80/95 % ; ne pas consommer artificiellement un quota pour tester.
- Comparer les resets et leur fuseau ; « ≈ » désigne une durée relative, pas une date absolue garantie.
- Tester page déconnectée, interface française/anglaise, changement d’espace et absence de carte selon l’abonnement.
- Conserver les autres onglets actifs, vérifier le suivi après 5 min puis arrêter/fermer l’onglet dédié.
- Vérifier le passage à « périmé » après 15 min sans observation, puis le reset passé sans remise à zéro inventée.
- Vérifier widget/réglages après fermeture/réouverture ; notifications seulement après autorisation.
- Après changement de compte/espace, supprimer les relevés avant de reprendre.

## Transfert de contexte
Dans le widget, sélectionne les passages utiles dans la page puis clique « Transférer ». Si la sélection ne subsiste pas sur mobile, colle le texte dans l’aperçu. Tu peux aussi ouvrir le transfert depuis le tableau de bord. Choisis la destination, modifie le texte et coche le consentement. Clique Copier puis Ouvrir, colle dans le nouveau fil et envoie après vérification. Aucun fil natif, pièce jointe ou message caché n’est migré. Si la copie est refusée, copie manuellement depuis le champ.

## Barre de menus Mac
Le ZIP `AI-Flow-v0.5-macOS-Menu-Source.zip` contient le code SwiftUI, le handler Safari, les ressources `safari-macos/` et les instructions d’intégration. Il exige macOS 13+ et une compilation Mac. Il ne s’installe pas sur iPhone et n’est pas un ZIP destiné au packager web Apple. Le ZIP Apple standard reste compatible avec le parcours iPhone décrit plus haut, sans menu natif.
