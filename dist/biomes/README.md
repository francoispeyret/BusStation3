# Ajouter un biome à Bus Station 3

Chaque biome a son propre script. Il enregistre sa définition et ses modèles dans `BusBiomes`. Les deux moteurs utilisent le même terrain, les mêmes positions et les mêmes mouvements. Les modèles utilisés par plusieurs biomes, comme le palmier et le passant, sont enregistrés dans `shared-models.js`.

Pour ajouter un paysage, créer son fichier dans ce dossier et charger le script avec `defer` dans `dist/index.html`, après le catalogue et avant `drive.js`. Le tirage des tours, le panneau et l’annonce utilisent automatiquement l’identifiant et le nom enregistrés.

```js
window.BusBiomes.register('verger', {
  name: 'Verger',
  grass: '#aabb72',
  verge: '#cdb78a',
  height(offset, z) {
    const bank = Math.min(1, Math.max(0, (Math.abs(offset) - 8) / 18));
    return bank * (2 + Math.sin(z / 30));
  },
  populate({length, road, random, add}) {
    add('walker', length * .45, -(road + 3), {
      variant: Math.floor(random() * 3),
      motion: (time, phase) => ({z: 2 * Math.sin(time * .4 + phase)})
    });
  }
});
```

- **Terrain.** Les distances sont en mètres. `offset` part du centre de la route, négatif à gauche et positif à droite. `z` est une position longitudinale absolue. `height(offset,z)` donne l’altitude et `surface(offset,z)` peut donner une couleur locale pour une rive ou un sol varié. La chaussée se trouve à `y=0`. Pour du relief, laisser sa bande centrale dégagée.
- **Route.** `roadColor` colore la chaussée. La bande de couleur `verge` s’étend sur `shoulder` mètres à partir du bitume. Le reste de la voie d’accotement reprend la couleur locale de `surface` ou, à défaut, de `grass`. Les roues projettent le matériau de la bande qu’elles touchent. `curb` place une bordure à la limite extérieure de la voie praticable. `roadDetails` décrit des bandes continues. `roadPaint(z)` reçoit le début d’une tranche de quatre mètres et renvoie les marques à peindre, avec `left`, `right`, `y`, `length` et `color`. La grande ville utilise ce mécanisme pour les passages piétons.
- **Placement.** `populate` reçoit le numéro de section `index`, sa longueur `length`, la demi-largeur praticable `road` (accotement compris), un générateur `random()` stable pour cette section et `add`. La position longitudinale donnée à `add` est **locale** à la section. Utiliser `index * length + along` pour la comparer à une position absolue. Le moteur pose les objets sur le terrain. `anchor: 'road'` les rattache à l’altitude de la chaussée, notamment pour les structures d’un pont.
- **Modèles et vie.** `BusBiomes.model(id, (mesh, variant) => { … })` construit une géométrie autour de l’origine, avec son pied à `y=0`. Garder un nombre fini de variantes pour réutiliser les maillages. `add` accepte `size`, `variant`, `yaw` (radians), `lift` (mètres) et `motion(time,phase)`. Cette dernière renvoie des déplacements en mètres et des rotations en radians. Le temps est celui de la partie et se fige en pause.
