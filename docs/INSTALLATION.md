# Installer AI Flow 0.8.2

**Pas besoin d’Xcode.** Pour tout utiliser, Safari et le Terminal suffisent. Xcode ne sert qu’à l’installation « app Mac », facultative (voir B).

| | Sans Xcode (recommandé) | Avec Xcode (facultatif) |
|---|---|---|
| Quotas, Smart Switch, transfert, historique, relance | ✅ | ✅ |
| **Awake** (Mac éveillé) | ✅ mode Terminal : une commande à copier | ✅ automatique |
| Notifications macOS | bannières dans la pastille | ✅ |
| Reste installée quand tu quittes Safari | ❌ à rajouter au prochain lancement | ✅ |

## 0. Décompresser l’archive

Double-clique sur `AI-Flow-v0.8.2-Safari-Mac.zip` dans **Téléchargements** : un dossier apparaît. Il contient un sous-dossier `safari`.

## A. Sans Xcode : extension temporaire dans Safari

1. Safari › **Réglages** › **Avancés** : coche « Afficher les fonctionnalités pour les développeurs web ».
2. Safari › Réglages › **Développeur** : clique **Ajouter une extension temporaire…**, puis choisis le dossier **`safari`** à l’intérieur du dossier décompressé.
3. Si l’ancienne version d’AI Flow est encore installée, désactive-la dans Safari › Réglages › **Extensions**.
4. Dans Safari › Réglages › Extensions › AI Flow, autorise l’accès aux sites (claude.ai, chatgpt.com, grok.com…).
5. Ouvre Claude (et/ou ChatGPT, Grok) dans un onglet, connecte-toi, puis recharge la page.

Safari retire l’extension temporaire quand tu le quittes : refais l’étape 2 au lancement suivant. Tes réglages et relevés peuvent être perdus à ce moment-là.

**Le bouton « Ajouter une extension temporaire… » n’existe pas chez toi ?** Il apparaît à partir de Safari 18. Sinon, utilise **Chrome** ou **Edge** (voir plus bas) : tout fonctionne, y compris Awake en mode Terminal.

### Awake sans app Mac (mode Terminal)
1. AI Flow › **Paramètres** › Continuité : active **Relance après quota** et **Awake**.
2. Programme une relance depuis la pastille d’une conversation Claude ou ChatGPT.
3. Clique **Copier la commande Terminal** (dans la pastille ou dans Paramètres). C’est une commande du type `caffeinate -i -t 7800`, déjà calculée pour ta relance.
4. Ouvre **Terminal** (Applications › Utilitaires), colle avec ⌘V, appuie sur Entrée et **laisse la fenêtre ouverte**.

`caffeinate` est un outil fourni par Apple dans macOS : rien à installer. Il empêche la mise en veille automatique jusqu’à 10 min après la relance, puis s’arrête tout seul. Pour arrêter avant, ferme la fenêtre de Terminal. Il ne réveille pas un Mac déjà endormi et n’empêche pas la veille capot fermé sur batterie. Laisse Safari ouvert.

## B. Facultatif : app Mac avec Xcode (Awake automatique)

Il faut **Xcode** (gratuit, Mac App Store) et un compte Apple. Un compte gratuit suffit pour ton propre Mac.

1. Dans le Terminal, depuis le dossier décompressé :
   ```
   ./prepare-safari.sh
   ```
   Le script génère le projet, installe automatiquement le composant natif et l'app Mac (Awake, barre des menus, notifications), puis ouvre Xcode.
2. Dans Xcode, en haut, choisis le schéma **AI Flow (macOS)**.
3. Clique sur le projet « AI Flow » à gauche, onglet **Signing & Capabilities**. Pour les cibles **AI Flow (macOS)** et **AI Flow Extension (macOS)**, choisis ton équipe (« Personal Team » convient).
4. Appuie sur **▶︎ (Run)**. L'app AI Flow s'ouvre.
5. Safari › Réglages › **Développeur** : coche **Autoriser les extensions non signées**. Cette option se décoche à chaque redémarrage de Safari avec une signature personnelle.
6. Safari › Réglages › **Extensions** : active **AI Flow** et autorise les sites.
7. Dans AI Flow › **Paramètres** › Continuité, active **Awake**, puis clique **Tester (2 min)**. Une tasse apparaît dans la barre des menus et l'état indique « Actif jusqu'à … ».

Pour mettre à jour plus tard, relance `./prepare-safari.sh`. Il crée un nouveau dossier (`AI-Flow-Apple-2`…) sans écraser l'ancien.

### Si Awake reste « Indisponible »
- « app AI Flow non installée ou composant natif absent » : l'extension a été chargée en mode temporaire (A), ou le script a affiché un avertissement ⚠︎. Il faut alors copier `native/SafariWebExtensionHandler.swift` et `native/AppDelegate.swift` dans le projet Xcode, comme indiqué par le script.
- « l'app AI Flow ne s'est pas lancée » : lance-la une fois à la main depuis Xcode ou le Finder. Dans son menu (barre des menus), tu peux activer « Ouvrir AI Flow à la connexion ».

## Chrome / Edge

1. Décompresse `AI-Flow-v0.8.2-Chrome-Edge.zip`.
2. Ouvre `chrome://extensions` ou `edge://extensions` et active le **Mode développeur**.
3. Clique **Charger l'extension non empaquetée** et choisis le dossier `chrome-edge`.

Les notifications du système sont disponibles. Sur Mac, Awake fonctionne en mode Terminal (voir plus haut).

## iPhone / iPad

Le projet généré par `prepare-safari.sh` contient aussi les cibles iOS : choisis le schéma **AI Flow (iOS)** et ton iPhone dans Xcode. Safari iOS suspend souvent les extensions en arrière-plan : les quotas se mettent à jour quand tu reviens sur l'onglet. Awake et les notifications système ne sont pas disponibles sur iOS.
