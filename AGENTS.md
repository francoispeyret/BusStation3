# Travailler sur Bus Station 3

Bus Station 3 est un jeu d’arcade de conduite en français, écrit en HTML, CSS et JavaScript. **Les sources à modifier sont dans `dist/`**. Le navigateur les charge directement. Le projet fonctionne sans installation npm ni compilation.

## Se placer et lancer le jeu

Exécuter les commandes depuis la racine Git, qui contient `dist/`, `tests/` et `.github/`. Si le dossier ouvert contient un `index.html` qui redirige vers `bus-station-3/dist/index.html`, faire d’abord `cd bus-station-3`.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Ouvrir `http://127.0.0.1:8000/`. Le jeu prend aussi en charge l’ouverture directe de `dist/index.html` en `file://`. Conserver des chemins de ressources relatifs pour ce mode et pour GitHub Pages.

## Où intervenir

Tous les chemins du tableau sont relatifs à `dist/`.

| Pour modifier | Commencer par |
| --- | --- |
| Accueil, commandes clavier et tactiles, compteurs, pause ou classement | `index.html` et `style.css` pour la présentation, `arcade.js` pour les interactions. Le classement, le choix du bus et les réglages audio utilisent `localStorage`. |
| Conduite et sons | `drive.js` gère la course arcade. `career-sim.js` gère la conduite libre, les arrêts et le trafic. Les deux modes utilisent `bus-handling.js` pour la direction et la boîte de vitesses, et `bus-audio.js` pour le moteur et les effets sonores. |
| Interface carrière et réglages | `career.html`, `career.css` et `career.js` pour le service et le plan. `career-profiles.js` gère les cartes de service et les recettes. `game-controls.js` relie les commandes de volume et de qualité graphique aux deux modes. |
| Caméra, éclairage, ombres ou effets de route | `world.js` et `three-scene.js` construisent la vue arcade. `career-render.js` construit la ville et la campagne. Les deux modes partagent le ciel dans `sky.js` et les lumières, matériaux et ombres VSM dans `three-lighting.js`. |
| Flotte et géométrie des bus | `bus-models.js` pour le catalogue et les maillages, `mesh.js` pour les primitives communes. La sélection sur l’accueil se trouve dans `arcade.js`. |
| Paysages, terrain et habitants | Un fichier par paysage dans `biomes/`. `biomes/route.js` calcule le relief, les transitions et la position des objets pour les deux moteurs. Pour ajouter un paysage, suivre [le guide des biomes](dist/biomes/README.md). |
| Jauge de vie, polices, images ou sons | `heart-meter.js` et `heart-meter.css` pour les cœurs. Les ressources se trouvent dans `assets/` et leurs licences dans `assets/licenses/`. |

## Ordre de chargement

Les scripts classiques chargés avec `defer` dans `dist/index.html` partagent leurs API via `window`. Un nouveau biome doit s’enregistrer après `biomes/catalog.js` et avant `drive.js`, qui lit les définitions dès son chargement. `biomes/route.js` dépend ensuite de `BusDrive`. `arcade.js` démarre l’interface en dernier.

Lorsqu’un script ou une feuille de style modifiés ont déjà un suffixe `?v=` dans `dist/index.html`, incrémenter sa version pour que les navigateurs rechargent le fichier publié.

## Vérifier et publier

```sh
node --test tests/*.test.cjs
```

La suite suit l’ordre des scripts du HTML et s’arrête avant `world.js`. Elle couvre le tirage des biomes, les raccords du terrain, les modèles, les habitants, la conduite sur les accotements et les sauts sur tremplin. Pour un changement de rendu ou d’interface, compléter dans le navigateur en vérifiant la démo d’accueil, puis le comportement modifié en partie.

Un push sur `main` déclenche le [workflow GitHub Pages](.github/workflows/pages.yml), qui publie directement `dist/`. Ce workflow ne lance pas les tests. La configuration d’hébergement [`.openai/hosting.json`](.openai/hosting.json) utilise également `dist/`.
