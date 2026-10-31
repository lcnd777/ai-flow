# Installer AI Flow 0.8.0

Deux façons de l'installer sur Mac, selon ce que tu veux :

| | Test rapide (sans Xcode) | Installation complète (Xcode) |
|---|---|---|
| Durée | 2 minutes | 10 à 15 minutes |
| Quotas, Smart Switch, transfert, historique | ✅ | ✅ |
| Relance après quota | ✅ | ✅ |
| **Awake** (Mac éveillé) et notifications macOS | ❌ | ✅ |
| Reste installée après avoir quitté Safari | ❌ | ✅ |

## 0. Décompresser l'archive

1. Double-clique sur `AI-Flow-v0.8.0-Safari-Mac.zip` dans **Téléchargements**. Un dossier `AI-Flow-v0.8.0-Safari-Mac` apparaît.
2. Ouvre **Terminal**, puis tape `cd ` (avec un espace) et **glisse ce dossier** dans la fenêtre du Terminal. Appuie sur Entrée.
   Tu dois voir `prepare-safari.sh` quand tu tapes `ls`.

> Sur ta capture précédente, la commande était lancée depuis ton dossier personnel (`~`). C'est pour ça que `prepare-safari.sh` restait introuvable : il faut d'abord se placer dans le dossier décompressé.

## A. Test rapide (extension temporaire)

1. Safari › **Réglages** › **Avancés** : coche « Afficher les fonctionnalités pour les développeurs web ».
2. Safari › Réglages › **Développeur** : clique **Ajouter une extension temporaire…**, puis choisis le dossier `safari` qui se trouve dans le dossier décompressé.
3. Si l'ancienne version d'AI Flow est installée, désactive-la dans Safari › Réglages › Extensions.
4. Dans Safari › Réglages › **Extensions** › AI Flow, autorise l'accès à claude.ai, chatgpt.com et grok.com.
5. Ouvre Claude (et/ou ChatGPT, Grok) dans un onglet, connecte-toi, puis recharge la page.

Safari retire l'extension temporaire quand tu le quittes : refais l'étape 2 au besoin.

## B. Installation complète avec Awake (Xcode)

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

1. Décompresse `AI-Flow-v0.8.0-Chrome-Edge.zip`.
2. Ouvre `chrome://extensions` ou `edge://extensions` et active le **Mode développeur**.
3. Clique **Charger l'extension non empaquetée** et choisis le dossier `chrome-edge`.

Les notifications du système sont disponibles. Awake ne l'est pas : il ne fonctionne que sous macOS avec Safari.

## iPhone / iPad

Le projet généré par `prepare-safari.sh` contient aussi les cibles iOS : choisis le schéma **AI Flow (iOS)** et ton iPhone dans Xcode. Safari iOS suspend souvent les extensions en arrière-plan : les quotas se mettent à jour quand tu reviens sur l'onglet. Awake et les notifications système ne sont pas disponibles sur iOS.
