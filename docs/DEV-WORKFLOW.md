# Développement d’AI Flow sans ZIP ni Xcode

Objectif : installer **AI Flow Dev** une seule fois. Ensuite, chaque modification envoyée sur GitHub est compilée dans le cloud, sur un Mac avec Xcode. L’app installée propose **« Installer et relancer »**. Tes réglages, ton historique et tes points de reprise sont conservés.

## Comment ça marche

```
Work (Claude) pousse le code ─► GitHub (branche main)
                                   │
                                   ├─ « Tests » : tests unitaires (Linux)
                                   └─ « AI Flow Dev (macOS) » : Mac du cloud avec Xcode
                                        1. tests
                                        2. XcodeGen génère le projet (macos/project.yml)
                                        3. compilation de l’app + extension Safari
                                        4. signature (Developer ID si fourni, sinon ad hoc)
                                        5. notarisation Apple (si fournie)
                                        6. archive signée Ed25519 + appcast Sparkle
                                        7. publication : release « dev-N » + canal « dev-channel »
Ton Mac : AI Flow Dev vérifie toutes les heures ─► « Une nouvelle version est disponible » ─► Installer et relancer
```

| Élément | Valeur (ne change jamais) |
|---|---|
| App de développement | `AI Flow Dev`, identifiant `ai.flow.dev`, lien `aiflow-dev://` |
| Extension Safari | `AI Flow Dev`, identifiant `ai.flow.dev.Extension` |
| Future app publique | `ai.flow.app` / `ai.flow.app.Extension`, lien `aiflow://` (séparée : les deux peuvent coexister) |
| Flux de mises à jour | `https://github.com/<toi>/<dépôt>/releases/download/dev-channel/appcast.xml` |
| Numéro de build | numéro d’exécution GitHub Actions : toujours croissant |

Safari range les données de l’extension sous son identifiant. Comme celui-ci ne change jamais, une mise à jour conserve réglages, historique, points de reprise, relances et autorisations de sites.

## Ce qui te revient (une seule fois)

### 1. GitHub (obligatoire, 5 min)
1. Crée un dépôt, par exemple `ai-flow`. Il doit être **public**, car Sparkle télécharge les mises à jour sans identifiant. Si tu veux garder le code privé, voir « Dépôt privé » plus bas.
2. Connecte ton compte GitHub à Claude : https://claude.ai/connect-github (et installe l’app Claude sur ce dépôt).
3. Donne-moi le nom du dépôt : je pousse le projet, et les compilations démarrent toutes seules.
4. Dépôt › **Settings › Secrets and variables › Actions › New repository secret** :
   - `SPARKLE_ED_PRIVATE_KEY` = la valeur fournie dans le fichier `sparkle-private-key.txt`. C’est la clé qui signe les mises à jour : ne la partage pas et ne la mets jamais dans le dépôt.

### 2. Signature Apple (fortement recommandé, 99 €/an)
Sans compte Apple Developer payant, les apps sont signées « ad hoc ». Elles fonctionnent, mais :
- au **premier lancement**, il faut faire clic droit › Ouvrir (Gatekeeper) ;
- Safari n’active une extension non signée que si **Développement › Autoriser les extensions non signées** est coché. Cette case **se décoche à chaque fois que tu quittes Safari**.

Le critère « plus aucune manipulation » n’est donc **atteignable qu’avec la signature Developer ID**. Elle se met en place sans Xcode :
1. Inscription : https://developer.apple.com/programs/ (99 €/an).
2. **Trousseaux d’accès** › menu Trousseaux d’accès › Assistant de certification › *Demander un certificat à une autorité de certification* › « Enregistré sur le disque ».
3. https://developer.apple.com/account/resources/certificates › **+** › *Developer ID Application* › envoie le fichier créé à l’étape 2, télécharge le certificat et double-clique dessus.
4. Dans Trousseaux d’accès, clic droit sur « Developer ID Application : … » › Exporter › format `.p12`, avec un mot de passe.
5. Terminal : `base64 -i ~/Desktop/Certificats.p12 | pbcopy`, puis secrets GitHub :
   - `MAC_CERT_P12_BASE64` (coller) ;
   - `MAC_CERT_PASSWORD` ;
   - `APPLE_TEAM_ID` (10 caractères, en haut à droite de developer.apple.com).
6. Notarisation : https://appstoreconnect.apple.com/access/integrations/api › **+** › rôle *Developer* › télécharge la clé `.p8`. Puis `base64 -i AuthKey_XXXX.p8 | pbcopy` › secrets :
   - `NOTARY_KEY_P8_BASE64` ;
   - `NOTARY_KEY_ID` ;
   - `NOTARY_ISSUER_ID`.

Dès que ces secrets existent, la compilation suivante signe et notarise automatiquement. Il n’y a rien d’autre à modifier.

### 3. Installation initiale (une seule fois)
1. Ouvre `https://github.com/<toi>/<dépôt>/releases/tag/dev-channel` et télécharge **AI-Flow-Dev.zip**. C’est le seul téléchargement manuel : les versions suivantes arrivent par l’app.
2. Glisse **AI Flow Dev** dans **Applications** et ouvre-la.
3. Safari › Réglages › **Extensions** : active **AI Flow Dev** et autorise claude.ai et chatgpt.com.
4. Dans l’ancienne extension temporaire : Paramètres › Version et mises à jour › **Sauvegarder mes données**. Dans AI Flow Dev : **Restaurer une sauvegarde…**. Puis retire l’extension temporaire (Safari › Réglages › Développeur).
5. Menu de l’icône AI Flow Dev (barre des menus) › **Ouvrir AI Flow Dev à la connexion**.

## Au quotidien
- Une nouvelle version est publiée environ 10 minutes après chaque envoi de code.
- L’app la détecte (au lancement puis toutes les heures) et propose **Installer et relancer**. Tu peux aussi vérifier tout de suite :
  - AI Flow › Paramètres › **Rechercher une mise à jour** ;
  - ou menu de la barre des menus › **Rechercher des mises à jour…**.
- **Recharger l’extension** (Paramètres) redémarre l’extension sans quitter Safari, utile si elle semble figée.

## Tests rapides sans compilation (Chrome / Edge)
Pour tester une modification en quelques secondes :
1. `git clone` du dépôt une fois.
2. Chrome › `chrome://extensions` › mode développeur › **Charger l’extension non empaquetée** › dossier `dist/chrome-edge`, construit avec `node tools/build.mjs`.
3. Ensuite : `git pull && node tools/build.mjs`, puis « Recharger » sur la carte de l’extension.

Les données restent dans le profil Chrome. Safari, lui, passe toujours par l’app (une extension Safari signée ne peut pas être modifiée sur place).

## Dépôt privé
Sparkle ne peut pas lire une release privée. Deux options :
- un **second dépôt public** ne contenant que les releases : la CI y publie avec un jeton ;
- un hébergement statique (GitHub Pages d’un dépôt public, S3…).

Dis-moi laquelle tu préfères : la modification de la CI est mineure.

## Vérifié / non vérifié
- **Vérifié ici (Linux)** :
  - tests de signature Ed25519 et du flux ;
  - stabilité des identifiants et versions croissantes ;
  - sauvegarde et restauration sans perte ;
  - **cycle complet simulé dans Chromium** (`tests/e2e/update-cycle.cjs`) : installation, publication signée, refus d’une mise à jour falsifiée, mise à jour, redémarrage, données conservées.
- **Non vérifié** (aucun Mac ni compte GitHub dans cet environnement) :
  - la première exécution de la CI macOS (XcodeGen, compilation, intégration de Sparkle) ;
  - la signature et la notarisation Apple ;
  - l’installation d’une mise à jour par Sparkle dans Safari ;
  - le comportement de Sparkle avec une app signée « ad hoc ».

  La première compilation sur GitHub servira de validation. Je corrigerai ce qu’elle révèle.
