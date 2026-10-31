# AI Flow — Usage Monitor 0.12.3 (bêta)

**Never lose your flow to an AI limit.**

AI Flow est une extension Safari (Mac, iPhone, iPad), Chrome et Edge. Elle montre d'un coup d'œil quelles IA sont disponibles, prévient avant les limites, aide à passer d'une IA à l'autre sans perdre le contexte et peut relancer une conversation quand le quota se rouvre.

- **Développement sans ZIP ni Xcode** : [docs/DEV-WORKFLOW.md](docs/DEV-WORKFLOW.md) (app AI Flow Dev, mises à jour automatiques).
- **Installation** : [docs/INSTALLATION.md](docs/INSTALLATION.md). Sans Xcode : Safari (extension temporaire) ou Chrome / Edge. Awake : rattrapage au réveil par défaut, réveil programmé en option.
- **Ce qui est vraiment mesuré** : [docs/QUOTAS.md](docs/QUOTAS.md)
- **Confidentialité** : [docs/PRIVACY.md](docs/PRIVACY.md)
- **Tests et vérifications restantes** : [docs/VALIDATION.md](docs/VALIDATION.md)
- **Nouveautés** : [CHANGELOG.md](CHANGELOG.md)

## En bref

| Interface | Rôle |
|---|---|
| Fenêtre (icône AI Flow) | Consultation rapide : quotas, Smart Switch, relances et reprises. Trois boutons ouvrent les pages ci-dessous dans un vrai onglet. |
| Pastille dans les sites | Quotas de la plateforme ouverte, Smart Switch, transfert, relance après quota, bannières de notification. |
| Tableau de bord | Toutes les plateformes, historique 24 h / 7 jours, relances, Awake, reprises. |
| Transférer | Message de reprise structuré et modifiable, à copier vers une autre IA ; reprises enregistrées. |
| Paramètres | Plateformes affichées et ordre, notifications, pastille, relance, Awake, données. |
| App Mac (Safari) | Awake (Mac éveillé jusqu'à une relance), notifications macOS, état dans la barre des menus. |

Principe : AI Flow n'affiche que des valeurs lues sur les plateformes elles-mêmes. Une plateforme qui n'expose pas son quota est marquée « Non mesuré ». Une valeur illisible est « Indisponible », jamais 0 %. Les estimations portent la mention « Estimation ».

## Développement

```
npm test                         # tests unitaires et de non-régression
node tools/build.mjs             # construit dist/chrome-edge
xvfb-run -a node tests/e2e/run.cjs   # intégration Chromium (Playwright requis)
node tools/build.mjs --zip       # archives de livraison
```

Structure : `safari/` (sources de l'extension, communes à tous les navigateurs), `native/` (Swift pour l'app Mac et l'extension), `tests/`, `tools/`, `docs/`.
